-- 0034_phase_a_seat_integrity — close the double-sell window.
--
-- A pending order now *reserves* its seats (seats.status = 'held') instead of
-- releasing the hold and leaving the seats 'available'. create_hold / create_order
-- take row locks so a second buyer can't slip in while the first is on the
-- Stripe page. TTLs and kickoff lock read app_settings instead of hard-coded
-- literals, and order expiry is aligned with the Stripe session (30 min).

-- 1. orders gains an explicit expiry + checkout url for resume/cancel UX.
alter table public.orders add column if not exists expires_at timestamptz;
alter table public.orders add column if not exists checkout_url text;

-- Backfill: existing pending orders keep the old 15-min rule via coalesce in
-- expire_pending_orders; no data migration needed.

-- 2. create_hold: TTL + kickoff lock from app_settings; seats.status='available'
--    check is unchanged but now also excludes pending-order seats ('held').
create or replace function public.create_hold(p_match_id text, p_seat_ids text[])
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_count integer := coalesce(array_length(p_seat_ids, 1), 0);
  v_group text := 'h_' || replace(gen_random_uuid()::text, '-', '');
  v_ttl integer := coalesce((select (value #>> '{}')::int from public.app_settings where key = 'seat_hold_ttl_seconds'), 600);
  v_lock integer := coalesce((select (value #>> '{}')::int from public.app_settings where key = 'kickoff_lock_minutes'), 15);
  v_expires timestamptz := now() + (v_ttl || ' seconds')::interval;
  v_kickoff timestamptz;
  v_bad integer;
begin
  if v_user is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if v_count = 0 then
    raise exception 'Select at least one seat' using errcode = '22023';
  end if;
  if v_count > 8 then
    raise exception 'At most 8 seats per order' using errcode = '22023';
  end if;
  if (select count(distinct s) from unnest(p_seat_ids) as s) <> v_count then
    raise exception 'Duplicate seat ids' using errcode = '22023';
  end if;

  select kickoff_at into v_kickoff from public.matches where id = p_match_id;
  if v_kickoff is null then
    raise exception 'Match not found' using errcode = 'P0002';
  end if;
  if v_kickoff <= now() + (v_lock || ' minutes')::interval then
    raise exception 'Sales are closed for this match' using errcode = 'P0001';
  end if;

  -- Free expired holds for these seats before attempting the insert.
  update public.seat_holds
  set released_at = now()
  where seat_id = any (p_seat_ids)
    and released_at is null
    and expires_at <= now();

  select count(*) into v_bad
  from unnest(p_seat_ids) as sid
  where not exists (
    select 1
    from public.seats s
    join public.zones z on z.id = s.zone_id
    where s.id = sid
      and z.match_id = p_match_id
      and s.status = 'available'
  );
  if v_bad > 0 then
    raise exception 'One or more seats are unavailable' using errcode = '23505';
  end if;

  begin
    insert into public.seat_holds (hold_group_id, seat_id, user_id, expires_at)
    select v_group, sid, v_user, v_expires from unnest(p_seat_ids) as sid;
  exception
    when unique_violation then
      raise exception 'Seats already held' using errcode = '23505';
  end;

  return jsonb_build_object(
    'id', v_group,
    'matchId', p_match_id,
    'seatIds', to_jsonb(p_seat_ids),
    'expiresAt', v_expires
  );
end;
$$;

-- 3. create_order_from_hold: reserve seats ('held') with row locks; never leave
--    them 'available' while the Stripe session is alive.
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
  v_seat_ids text[];
begin
  if v_user is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  select min(h.expires_at), min(z.match_id), array_agg(h.seat_id)
    into v_expires, v_match, v_seat_ids
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

  -- Lock the seat rows first, then verify they are still available. This
  -- serialises concurrent buyers: a pending order sets status='held', so a
  -- second buyer's create_hold/create_order will see 'held' and be rejected.
  perform 1 from public.seats where id = any (v_seat_ids) for update;

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

  insert into public.orders (user_id, match_id, amount_satang, status, expires_at)
  values (v_user, v_match, v_amount, 'pending', now() + interval '30 minutes')
  returning id into v_order_id;

  insert into public.order_seats (order_id, seat_id, zone_name, row_label, number, price_satang)
  select v_order_id, s.id, z.name, s.row_label, s.number, z.price_satang
  from public.seat_holds h
  join public.seats s on s.id = h.seat_id
  join public.zones z on z.id = s.zone_id
  where h.hold_group_id = p_hold_id
    and h.user_id = v_user
    and h.released_at is null;

  -- Reserve the seats for the lifetime of the pending order.
  update public.seats
  set status = 'held'
  where id = any (v_seat_ids);

  -- The hold row is no longer needed; the pending order now owns the seats.
  update public.seat_holds
  set released_at = now()
  where hold_group_id = p_hold_id
    and user_id = v_user
    and released_at is null;

  return jsonb_build_object('id', v_order_id, 'amountSatang', v_amount, 'matchId', v_match);
end;
$$;

-- 4. mark_order_paid: only flip 'held' seats owned by this order to 'sold';
--    a seat that is no longer 'held' means a double-sell was attempted -> P0001
--    (webhook auto-refunds).
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
      paid_at = now(),
      expires_at = null
  where id = p_order_id;

  for v_seat in
    select os.seat_id, os.id as order_seat_id
    from public.order_seats os
    where os.order_id = p_order_id and os.ticket_id is null
    for update of os
  loop
    -- Lock the seat row and verify it is still held by this order.
    perform 1 from public.seats where id = v_seat.seat_id for update;

    if not exists (
      select 1 from public.seats
      where id = v_seat.seat_id and status = 'held'
    ) then
      -- Already sold (replay) is fine; anything else is a conflict.
      if not exists (
        select 1 from public.seats where id = v_seat.seat_id and status = 'sold'
      ) then
        raise exception 'Seat no longer available' using errcode = 'P0001';
      end if;
    else
      update public.seats set status = 'sold' where id = v_seat.seat_id;
    end if;

    insert into public.tickets (order_id, order_seat_id, user_id, match_id, seat_id)
    values (p_order_id, v_seat.order_seat_id, v_user, v_match, v_seat.seat_id)
    returning id into v_ticket_id;

    update public.order_seats set ticket_id = v_ticket_id where id = v_seat.order_seat_id;
  end loop;

  return jsonb_build_object('id', p_order_id, 'status', 'paid', 'replayed', false);
end;
$$;

-- 5. cancel_order (authenticated owner) + cancel_order_internal (service role).
create or replace function public.cancel_order(p_order_id text, p_actor_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status public.order_status;
  v_user uuid;
  v_actor uuid := coalesce(p_actor_id, auth.uid());
begin
  select status, user_id into v_status, v_user
  from public.orders where id = p_order_id for update;

  if v_status is null then
    raise exception 'Order not found' using errcode = 'P0002';
  end if;
  if v_actor is not null and v_actor <> v_user and not public.is_admin() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if v_status = 'cancelled' then
    return jsonb_build_object('id', p_order_id, 'status', 'cancelled', 'replayed', true);
  end if;
  if v_status <> 'pending' then
    raise exception 'Order is not pending' using errcode = 'P0001';
  end if;

  update public.orders set status = 'cancelled', expires_at = null where id = p_order_id;

  -- Free any seats this order had reserved.
  update public.seats
  set status = 'available'
  where id in (select seat_id from public.order_seats where order_id = p_order_id)
    and status = 'held';

  return jsonb_build_object('id', p_order_id, 'status', 'cancelled', 'replayed', false);
end;
$$;

create or replace function public.cancel_order_internal(p_order_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Service-role only: skip ownership checks.
  return public.cancel_order(p_order_id, null);
end;
$$;

-- 6. expire_pending_orders: use expires_at when set (Stripe session window),
--    falling back to the original 15-minute rule; free seats on cancel.
create or replace function public.expire_pending_orders()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer := 0;
  v_ids text[];
begin
  select array_agg(id) into v_ids
  from public.orders
  where status = 'pending'
    -- Orders that reached Stripe carry expires_at = session expiry (30 min).
    -- Session-less/legacy orders keep the original 15-minute rule.
    and coalesce(expires_at, created_at + interval '15 minutes') <= now();

  if v_ids is not null then
    update public.seats
    set status = 'available'
    where id in (select seat_id from public.order_seats where order_id = any (v_ids))
      and status = 'held';

    update public.orders
    set status = 'cancelled', expires_at = null
    where id = any (v_ids);

    get diagnostics v_count = row_count;
  end if;

  return coalesce(v_count, 0);
end;
$$;

-- refund helper: free seats on refund (admin path calls cancel_order_internal? no —
-- refund keeps order 'refunded'; free seats separately). Expose RPC.
create or replace function public.free_seats_for_order(p_order_id text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  update public.seats
  set status = 'available'
  where id in (select seat_id from public.order_seats where order_id = p_order_id)
    and status in ('held', 'sold');
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

grant execute on function public.create_hold(text, text[]) to authenticated;
grant execute on function public.release_hold(text) to authenticated;
grant execute on function public.create_order_from_hold(text) to authenticated;
grant execute on function public.mark_order_paid(text, text, text) to service_role;
grant execute on function public.cancel_order(text, uuid) to authenticated, service_role;
grant execute on function public.cancel_order_internal(text) to service_role;
grant execute on function public.expire_pending_orders() to service_role;
grant execute on function public.free_seats_for_order(text) to service_role;
