-- 0050 — RPC args that accept null say so.
--
-- The Stripe webhook calls `mark_order_paid` with a null `p_payment_intent_id`
-- (a checkout event without a payment intent — the database coalesces it away)
-- and `tenant_for_stripe_account` with a null account id (a platform event
-- carries no Connect account). Both are deliberate calls, but the parameters
-- were declared without a default, so the generated TypeScript types marked
-- them required — the typed client could not express the call the SQL was
-- built to accept.
--
-- `default null` is a statement about the function, not a behaviour change:
-- the bodies are byte-for-byte the definitions from `0043` and `0049`, and the
-- generated type now reads the way the database reads (`p_reason?: string` on
-- `mark_order_refunded` is the established pattern).
--
-- GAP-09.0: surfaced by typing the Edge clients against the schema — a
-- required-looking argument hid a legitimate null call behind `string`.

-- ── mark_order_paid ─────────────────────────────────────────────────────────
-- Body verbatim from `0043`; only `p_payment_intent_id` gains `default null`.
create or replace function public.mark_order_paid(
  p_order_id text,
  p_session_id text,
  p_payment_intent_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status public.order_status;
  v_user uuid;
  v_match text;
  v_seat record;
  v_ticket_id text;
begin
  select status, user_id, match_id
    into v_status, v_user, v_match
  from public.orders
  where id = p_order_id
  for update;

  if v_status is null then
    raise exception 'Order not found' using errcode = 'P0002';
  end if;
  if v_status = 'paid' then
    return jsonb_build_object('id', p_order_id, 'status', 'paid', 'replayed', true);
  end if;
  if v_status <> 'pending' then
    raise exception 'Order is not pending' using errcode = 'P0001';
  end if;

  update public.orders
  set status = 'paid',
      stripe_session_id = coalesce(p_session_id, stripe_session_id),
      payment_intent_id = coalesce(p_payment_intent_id, payment_intent_id),
      payment_ref = coalesce(p_payment_intent_id, p_session_id, payment_ref),
      paid_at = now(),
      expires_at = null
  where id = p_order_id;

  for v_seat in
    select os.seat_id, os.id as order_seat_id
    from public.order_seats os
    where os.order_id = p_order_id and os.ticket_id is null
    for update of os
  loop
    -- Lock the seat row, then prove nobody else has claimed it. The lock is
    -- what makes the check and the insert below atomic against a concurrent
    -- payment for the same seat.
    perform 1 from public.seats where id = v_seat.seat_id for update;

    if exists (
      select 1
      from public.order_seats other
      join public.orders o on o.id = other.order_id
      where other.seat_id = v_seat.seat_id
        and other.order_id <> p_order_id
        and o.status in ('pending', 'paid')
    ) then
      raise exception 'Seat no longer available' using errcode = 'P0001';
    end if;

    insert into public.tickets (order_id, order_seat_id, user_id, match_id, seat_id)
    values (p_order_id, v_seat.order_seat_id, v_user, v_match, v_seat.seat_id)
    returning id into v_ticket_id;

    update public.order_seats set ticket_id = v_ticket_id where id = v_seat.order_seat_id;
  end loop;

  return jsonb_build_object('id', p_order_id, 'status', 'paid', 'replayed', false);
end;
$$;

-- ── tenant_for_stripe_account ───────────────────────────────────────────────
-- Body verbatim from `0049`; `p_account_id` gains `default null`.
create or replace function public.tenant_for_stripe_account(p_account_id text default null)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select t.id
  from public.tenants t
  where p_account_id is not null
    and t.stripe_account_id = p_account_id
  limit 1;
$$;

-- The ACL stays as it was; re-stated so the file is re-runnable.
revoke all on function public.tenant_for_stripe_account(text) from public;
grant execute on function public.tenant_for_stripe_account(text)
  to authenticated, service_role;
