-- 0020_order_functions — hold → order → paid → tickets.
create or replace function public.create_order_from_hold(p_hold_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_match text;
  v_expires timestamptz;
  v_order_id text;
  v_amount integer;
  v_bad integer;
begin
  if v_user is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  select min(h.expires_at), min(z.match_id)
    into v_expires, v_match
  from public.seat_holds h
  join public.seats s on s.id = h.seat_id
  join public.zones z on z.id = s.zone_id
  where h.hold_group_id = p_hold_id
    and h.user_id = v_user
    and h.released_at is null;

  if v_match is null then
    raise exception 'Hold not found' using errcode = 'P0002';
  end if;
  if v_expires <= now() then
    raise exception 'Hold has expired' using errcode = 'P0001';
  end if;

  -- Lock and confirm the seats are still available after the hold.
  select count(*) into v_bad
  from public.seat_holds h
  join public.seats s on s.id = h.seat_id
  where h.hold_group_id = p_hold_id
    and h.user_id = v_user
    and h.released_at is null
    and s.status <> 'available';
  if v_bad > 0 then
    raise exception 'A held seat is no longer available' using errcode = '23505';
  end if;

  select coalesce(sum(z.price_satang), 0)
    into v_amount
  from public.seat_holds h
  join public.seats s on s.id = h.seat_id
  join public.zones z on z.id = s.zone_id
  where h.hold_group_id = p_hold_id
    and h.user_id = v_user
    and h.released_at is null;

  insert into public.orders (user_id, match_id, amount_satang, status)
  values (v_user, v_match, v_amount, 'pending')
  returning id into v_order_id;

  insert into public.order_seats (order_id, seat_id, zone_name, row_label, number, price_satang)
  select v_order_id, s.id, z.name, s.row_label, s.number, z.price_satang
  from public.seat_holds h
  join public.seats s on s.id = h.seat_id
  join public.zones z on z.id = s.zone_id
  where h.hold_group_id = p_hold_id
    and h.user_id = v_user
    and h.released_at is null;

  update public.seat_holds
  set released_at = now()
  where hold_group_id = p_hold_id
    and user_id = v_user
    and released_at is null;

  return jsonb_build_object('id', v_order_id, 'amountSatang', v_amount, 'matchId', v_match);
end;
$$;

-- Idempotent: replaying a webhook for an already-paid order is a no-op.
create or replace function public.mark_order_paid(
  p_order_id text,
  p_session_id text,
  p_payment_intent_id text
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
      paid_at = now()
  where id = p_order_id;

  for v_seat in
    select * from public.order_seats
    where order_id = p_order_id and ticket_id is null
    for update
  loop
    insert into public.tickets (order_id, order_seat_id, user_id, match_id, seat_id)
    values (p_order_id, v_seat.id, v_user, v_match, v_seat.seat_id)
    returning id into v_ticket_id;

    update public.order_seats set ticket_id = v_ticket_id where id = v_seat.id;
    update public.seats set status = 'sold' where id = v_seat.seat_id;
  end loop;

  return jsonb_build_object('id', p_order_id, 'status', 'paid', 'replayed', false);
end;
$$;

create or replace function public.expire_pending_orders()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  update public.orders
  set status = 'cancelled'
  where status = 'pending'
    and created_at < now() - interval '15 minutes';

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

grant execute on function public.create_order_from_hold(text) to authenticated;
grant execute on function public.mark_order_paid(text, text, text) to service_role;
grant execute on function public.expire_pending_orders() to service_role;
