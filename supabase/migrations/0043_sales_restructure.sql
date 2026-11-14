-- 0043_sales_restructure — C7.1: the commerce shape (D-26, ADR-002/003).
--
-- 0040–0042 made the rows tenant-owned. This step makes them *sellable*:
--
--   * `seats.status` and the `seat_status` enum are gone. A seat is physical
--     inventory; occupancy is derived, never cached — a seat is taken when an
--     unreleased hold exists or a live (`pending`/`paid`) order line claims it.
--     A cached flag can disagree with the tables that actually own the seat;
--     this is also what lets one physical seat be sold again next match.
--   * price moves off the zone onto `match_zone_prices (match, zone)`, so a
--     derby can be priced differently from a friendly without cloning zones.
--   * money columns are named for what they are — integer **minor units** —
--     and an order snapshots `currency` + `application_fee_amount`, so the
--     amount on a historical order can never be reinterpreted.
--   * `order_seats.match_id`, `seat_holds.match_id`, a unique seat per order
--     line and one ticket per order line make "one ticket per seat" a
--     database rule instead of a convention.
--   * `refunds` is a ledger row. `orders.status = 'refunded'` alone cannot
--     say who refunded, for how much, under which Stripe id.
--
-- Ordering matters: the RPCs and views are rewritten *before* the columns they
-- used to read are dropped, so no window exists where a function references a
-- column that is already gone.

-- ── money columns become minor units ────────────────────────────────────────
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'orders'
      and column_name = 'amount_satang'
  ) then
    alter table public.orders rename column amount_satang to amount_minor_units;
  end if;

  if exists (
    select 1 from pg_constraint
    where conname = 'orders_amount_satang_check'
      and conrelid = 'public.orders'::regclass
  ) then
    alter table public.orders
      rename constraint orders_amount_satang_check
      to orders_amount_minor_units_check;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'order_seats'
      and column_name = 'price_satang'
  ) then
    alter table public.order_seats rename column price_satang to price_minor_units;
  end if;

  if exists (
    select 1 from pg_constraint
    where conname = 'order_seats_price_satang_check'
      and conrelid = 'public.order_seats'::regclass
  ) then
    alter table public.order_seats
      rename constraint order_seats_price_satang_check
      to order_seats_price_minor_units_check;
  end if;
end $$;

-- The order snapshots the money it was actually sold in. The tenant is the
-- source of truth at sale time; afterwards the tenant may change and the order
-- must not follow. The backfill only runs when the columns are first added —
-- re-running the migration must never re-derive a historical snapshot from a
-- fee rate that has since changed.
do $$
declare
  v_fresh boolean;
begin
  select not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'orders'
      and column_name = 'application_fee_amount'
  ) into v_fresh;

  alter table public.orders
    add column if not exists currency text not null default 'THB';

  alter table public.orders
    add column if not exists application_fee_amount integer not null default 0;

  if v_fresh then
    update public.orders o
       set currency = coalesce(t.currency, o.currency),
           application_fee_amount =
             round(o.amount_minor_units * coalesce(t.application_fee_bps, 0) / 10000.0)::int
      from public.tenants t
     where t.id = o.tenant_id;
  end if;
end $$;

alter table public.orders drop constraint if exists orders_currency_check;
alter table public.orders add constraint orders_currency_check
  check (currency ~ '^[A-Z]{3}$');

alter table public.orders drop constraint if exists orders_application_fee_amount_check;
alter table public.orders add constraint orders_application_fee_amount_check
  check (application_fee_amount >= 0);

-- ── price per (match, zone) ─────────────────────────────────────────────────
create table if not exists public.match_zone_prices (
  match_id text not null references public.matches (id) on delete cascade,
  zone_id text not null references public.zones (id) on delete cascade,
  tenant_id uuid not null default '00000000-0000-0000-0000-000000000001',
  price_minor_units integer not null check (price_minor_units >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (match_id, zone_id),
  foreign key (match_id, tenant_id)
    references public.matches (id, tenant_id),
  foreign key (zone_id, tenant_id)
    references public.zones (id, tenant_id)
);

drop trigger if exists match_zone_prices_set_updated_at on public.match_zone_prices;
create trigger match_zone_prices_set_updated_at
before update on public.match_zone_prices
for each row execute function public.set_updated_at();

alter table public.match_zone_prices enable row level security;

-- Prices are public catalogue: the app shows "from ฿350" before sign-in.
-- Writes stay admin-only, exactly like the zone rows they replaced.
drop policy if exists match_zone_prices_public_read on public.match_zone_prices;
create policy match_zone_prices_public_read on public.match_zone_prices
for select to anon, authenticated using (true);

drop policy if exists match_zone_prices_admin_write on public.match_zone_prices;
create policy match_zone_prices_admin_write on public.match_zone_prices
for all to authenticated
using (public.is_admin())
with check (public.is_admin());

revoke all on public.match_zone_prices from anon, authenticated;
grant select on public.match_zone_prices to anon, authenticated;
grant insert, update, delete on public.match_zone_prices to authenticated;
grant all on public.match_zone_prices to service_role;

-- Move the existing prices across, then retire the zone column. Guarded so a
-- re-run does not read a column that is already gone.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'zones'
      and column_name = 'price_satang'
  ) then
    insert into public.match_zone_prices (match_id, zone_id, tenant_id, price_minor_units)
    select z.match_id, z.id, z.tenant_id, z.price_satang
    from public.zones z
    on conflict (match_id, zone_id) do nothing;

    alter table public.zones drop column price_satang;
  end if;
end $$;

-- ── an order line belongs to a match ────────────────────────────────────────
alter table public.order_seats add column if not exists match_id text;

update public.order_seats os
   set match_id = o.match_id
  from public.orders o
 where o.id = os.order_id
   and os.match_id is null;

alter table public.order_seats alter column match_id set not null;

alter table public.order_seats drop constraint if exists order_seats_match_id_fkey;
alter table public.order_seats add constraint order_seats_match_id_fkey
  foreign key (match_id, tenant_id)
  references public.matches (id, tenant_id) not valid;
alter table public.order_seats validate constraint order_seats_match_id_fkey;

-- One order cannot claim the same seat twice.
alter table public.order_seats drop constraint if exists order_seats_order_id_seat_id_key;
alter table public.order_seats add constraint order_seats_order_id_seat_id_key
  unique (order_id, seat_id);

-- ── a hold belongs to a match ───────────────────────────────────────────────
alter table public.seat_holds add column if not exists match_id text;

update public.seat_holds h
   set match_id = z.match_id
  from public.seats s
  join public.zones z on z.id = s.zone_id
 where s.id = h.seat_id
   and h.match_id is null;

alter table public.seat_holds alter column match_id set not null;

alter table public.seat_holds drop constraint if exists seat_holds_match_id_fkey;
alter table public.seat_holds add constraint seat_holds_match_id_fkey
  foreign key (match_id, tenant_id)
  references public.matches (id, tenant_id) not valid;
alter table public.seat_holds validate constraint seat_holds_match_id_fkey;

-- ── one ticket per order line ───────────────────────────────────────────────
alter table public.tickets drop constraint if exists tickets_order_seat_id_key;
alter table public.tickets add constraint tickets_order_seat_id_key
  unique (order_seat_id);

-- D-26: at most one *live* ticket per seat per match. A voided ticket (a
-- refund) does not block the seat being sold again, but two people can never
-- hold a usable pass for the same seat.
drop index if exists public.tickets_one_live_seat_idx;
create unique index tickets_one_live_seat_idx
  on public.tickets (match_id, seat_id)
  where status <> 'void';

-- ── refunds are a ledger ────────────────────────────────────────────────────
create table if not exists public.refunds (
  id text primary key
    default ('ref_' || replace(gen_random_uuid()::text, '-', '')),
  order_id text not null,
  tenant_id uuid not null,
  amount_minor_units integer not null check (amount_minor_units >= 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  reason text,
  override_used_tickets boolean not null default false,
  used_tickets integer not null default 0,
  actor_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  -- A full-order refund is the only kind there is, so one order has at most
  -- one ledger row. `mark_order_refunded` locks the order first, which is what
  -- makes this a real invariant and not a race.
  unique (order_id),
  foreign key (order_id, tenant_id)
    references public.orders (id, tenant_id) on delete cascade
);

create index if not exists refunds_tenant_created_idx
  on public.refunds (tenant_id, created_at desc);

-- The ledger is evidence: service-role writes only, no client policy.
alter table public.refunds enable row level security;

revoke all on public.refunds from anon, authenticated;
grant all on public.refunds to service_role;

-- ── RPCs: occupancy without a status flag ───────────────────────────────────
-- 1. create_hold — a seat is free when nothing claims it. The claim is the
--    hold itself (unique per active seat) or a live order line, so the check
--    and the constraint agree instead of one mirroring a flag.
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

  -- Free expired holds for these seats before attempting the insert: the
  -- unique index below is per active seat and would otherwise refuse a seat
  -- whose hold simply lapsed.
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
  )
  or exists (
    select 1 from public.seat_holds h
    where h.seat_id = sid
      and h.released_at is null
      and h.expires_at > now()
  )
  or exists (
    select 1
    from public.order_seats os
    join public.orders o on o.id = os.order_id
    where os.seat_id = sid
      and o.status in ('pending', 'paid')
  );
  if v_bad > 0 then
    raise exception 'One or more seats are unavailable' using errcode = '23505';
  end if;

  begin
    insert into public.seat_holds (hold_group_id, seat_id, user_id, match_id, expires_at)
    select v_group, sid, v_user, p_match_id, v_expires from unnest(p_seat_ids) as sid;
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

-- 2. create_order_from_hold — the pending order's lines *are* the reservation.
--    There is no seat flag to flip, so the order is written and the hold
--    released inside the same transaction with no gap in between.
create or replace function public.create_order_from_hold(p_hold_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_match text;
  v_tenant uuid;
  v_currency text := 'THB';
  v_fee_bps integer := 0;
  v_expires timestamptz;
  v_order_id text;
  v_amount integer;
  v_bad integer;
  v_unpriced integer;
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

  select m.tenant_id, coalesce(t.currency, 'THB'), coalesce(t.application_fee_bps, 0)
    into v_tenant, v_currency, v_fee_bps
  from public.matches m
  left join public.tenants t on t.id = m.tenant_id
  where m.id = v_match;

  -- Lock the seat rows first, then verify no other live order claims them.
  -- The lock is held for the rest of the transaction, so a second checkout
  -- sees this order's lines; locking in id order keeps two overlapping
  -- checkouts from deadlocking on each other.
  perform 1
  from public.seats s
  where s.id in (
    select seat_id from public.seat_holds
    where hold_group_id = p_hold_id and user_id = v_user and released_at is null
  )
  order by s.id
  for update;

  select count(*) into v_bad
  from public.order_seats os
  join public.orders o on o.id = os.order_id
  where os.seat_id in (
      select seat_id from public.seat_holds
      where hold_group_id = p_hold_id and user_id = v_user and released_at is null
    )
    and o.status in ('pending', 'paid');
  if v_bad > 0 then
    raise exception 'A held seat is no longer available' using errcode = '23505';
  end if;

  -- A zone with no price for this match is a configuration error. Charging 0
  -- would turn a missing price into a free ticket, which is never the intent.
  select count(*) into v_unpriced
  from public.seat_holds h
  join public.seats s on s.id = h.seat_id
  join public.zones z on z.id = s.zone_id
  left join public.match_zone_prices mzp
    on mzp.match_id = z.match_id and mzp.zone_id = z.id
  where h.hold_group_id = p_hold_id
    and h.user_id = v_user
    and h.released_at is null
    and mzp.price_minor_units is null;
  if v_unpriced > 0 then
    raise exception 'No price is set for one or more zones' using errcode = 'P0001';
  end if;

  select coalesce(sum(mzp.price_minor_units), 0)
    into v_amount
  from public.seat_holds h
  join public.seats s on s.id = h.seat_id
  join public.zones z on z.id = s.zone_id
  join public.match_zone_prices mzp
    on mzp.match_id = z.match_id and mzp.zone_id = z.id
  where h.hold_group_id = p_hold_id
    and h.user_id = v_user
    and h.released_at is null;

  insert into public.orders
    (user_id, match_id, amount_minor_units, status, expires_at,
     currency, application_fee_amount, tenant_id)
  values
    (v_user, v_match, v_amount, 'pending', now() + interval '30 minutes',
     v_currency, round(v_amount * v_fee_bps / 10000.0)::int, v_tenant)
  returning id into v_order_id;

  insert into public.order_seats
    (order_id, seat_id, match_id, zone_name, row_label, number,
     price_minor_units, tenant_id)
  select v_order_id, s.id, v_match, z.name, s.row_label, s.number,
         mzp.price_minor_units, v_tenant
  from public.seat_holds h
  join public.seats s on s.id = h.seat_id
  join public.zones z on z.id = s.zone_id
  join public.match_zone_prices mzp
    on mzp.match_id = z.match_id and mzp.zone_id = z.id
  where h.hold_group_id = p_hold_id
    and h.user_id = v_user
    and h.released_at is null;

  -- The order lines now claim the seats, so the holds can go.
  update public.seat_holds
  set released_at = now()
  where hold_group_id = p_hold_id
    and user_id = v_user
    and released_at is null;

  return jsonb_build_object(
    'id', v_order_id,
    'amountMinorUnits', v_amount,
    'matchId', v_match
  );
end;
$$;

-- 3. mark_order_paid — the double-sell guard. A seat that another live order
--    claims means the reservation was lost between checkout and payment; the
--    webhook turns P0001 into an automatic refund.
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

-- 4. cancel_order — the order stops claiming its seats. Nothing else to do.
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

-- 5. expire_pending_orders — cancelling is what frees the seats.
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
    update public.orders
    set status = 'cancelled', expires_at = null
    where id = any (v_ids);

    get diagnostics v_count = row_count;
  end if;

  return coalesce(v_count, 0);
end;
$$;

-- 6. free_seats_for_order — there is no seat flag left to clear, so "free"
--    now means releasing any hold the order's own buyer still holds on those
--    seats. The seats themselves are released by the order's status change
--    that always accompanies this call.
create or replace function public.free_seats_for_order(p_order_id text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  update public.seat_holds h
  set released_at = now()
  from public.orders o
  where o.id = p_order_id
    and h.user_id = o.user_id
    and h.released_at is null
    and h.seat_id in (
      select seat_id from public.order_seats where order_id = p_order_id
    );

  get diagnostics v_count = row_count;
  return coalesce(v_count, 0);
end;
$$;

-- 7. mark_order_refunded — the database half of a refund is now a ledger row
--    plus the state change, in one transaction.
create or replace function public.mark_order_refunded(
  p_order_id text,
  p_actor_id uuid,
  p_refund_id text,
  p_reason text default null,
  p_override_used_tickets boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders%rowtype;
  v_used integer;
  v_freed integer := 0;
begin
  select * into v_order
    from public.orders
    where id = p_order_id
    for update;
  if not found then
    raise exception 'Order not found' using errcode = 'P0002';
  end if;

  if v_order.status = 'refunded' then
    return jsonb_build_object('refunded', true, 'alreadyRefunded', true);
  end if;
  if v_order.status <> 'paid' then
    raise exception 'Only paid orders can be refunded' using errcode = 'P0001';
  end if;

  select count(*) into v_used
    from public.tickets
    where order_id = p_order_id and status = 'used';

  if v_used > 0 and not coalesce(p_override_used_tickets, false) then
    raise exception 'Refunding used tickets requires the override'
      using errcode = 'P0001';
  end if;

  -- The order row is locked above, so no second refund can pass the status
  -- check while this one writes its ledger row.
  insert into public.refunds
    (id, order_id, tenant_id, amount_minor_units, currency,
     reason, override_used_tickets, used_tickets, actor_id)
  values
    (coalesce(p_refund_id, 'ref_' || replace(gen_random_uuid()::text, '-', '')),
     v_order.id, v_order.tenant_id, v_order.amount_minor_units, v_order.currency,
     p_reason, coalesce(p_override_used_tickets, false), v_used, p_actor_id);

  update public.orders set status = 'refunded' where id = p_order_id;
  update public.tickets set status = 'void' where order_id = p_order_id;

  v_freed := public.free_seats_for_order(p_order_id);

  insert into public.audit_logs (actor_id, action, entity, entity_id, metadata)
  values (
    p_actor_id,
    'order.refund',
    'orders',
    p_order_id,
    jsonb_build_object(
      'refund_id', p_refund_id,
      'amount_minor_units', v_order.amount_minor_units,
      'currency', v_order.currency,
      'reason', p_reason,
      'override_used_tickets', coalesce(p_override_used_tickets, false),
      'used_tickets', v_used
    )
  );

  return jsonb_build_object(
    'refunded', true,
    'alreadyRefunded', false,
    'seatsFreed', v_freed
  );
end;
$$;

-- ── views ───────────────────────────────────────────────────────────────────
-- Occupancy is derived here exactly the way `create_hold` derives it, so what
-- the buyer sees and what the buyer can do cannot disagree.
create or replace view public.zone_availability as
select
  s.zone_id,
  count(*) as total_seats,
  count(*) filter (
    where not exists (
      select 1 from public.seat_holds h
      where h.seat_id = s.id
        and h.released_at is null
        and h.expires_at > now()
    )
    and not exists (
      select 1
      from public.order_seats os
      join public.orders o on o.id = os.order_id
      where os.seat_id = s.id
        and o.status in ('pending', 'paid')
    )
  ) as available_seats,
  s.tenant_id
from public.seats s
group by s.zone_id, s.tenant_id;

drop view if exists public.match_sales_summary;
create view public.match_sales_summary as
select
  m.id as match_id,
  count(distinct o.id) filter (where o.status = 'paid') as orders_paid,
  coalesce(sum(os.price_minor_units) filter (where o.status = 'paid'), 0) as revenue_minor_units,
  count(os.id) filter (where o.status = 'paid') as tickets_sold
from public.matches m
left join public.orders o on o.match_id = m.id
left join public.order_seats os on os.order_id = o.id
group by m.id;

drop view if exists public.order_receipt_view;
create view public.order_receipt_view as
select
  o.id as order_id,
  o.user_id,
  o.match_id,
  o.amount_minor_units,
  o.currency,
  o.status,
  o.created_at,
  o.paid_at,
  o.payment_ref,
  p.full_name as holder,
  p.email as holder_email,
  m.opponent,
  m.kickoff_at,
  v.name as venue,
  coalesce(
    jsonb_agg(
      jsonb_build_object(
        'seatId', os.seat_id,
        'ticketId', os.ticket_id,
        'zoneName', os.zone_name,
        'row', os.row_label,
        'number', os.number,
        'priceMinorUnits', os.price_minor_units
      )
      order by os.zone_name, os.row_label, os.number
    ) filter (where os.id is not null),
    '[]'::jsonb
  ) as seats,
  o.tenant_id
from public.orders o
join public.profiles p on p.id = o.user_id
join public.matches m on m.id = o.match_id
join public.venues v on v.id = m.venue_id
left join public.order_seats os on os.order_id = o.id
group by
  o.id, p.full_name, p.email, m.opponent, m.kickoff_at, v.name, o.tenant_id;

grant select on public.zone_availability to anon, authenticated;
grant select on public.match_sales_summary, public.order_receipt_view to authenticated;

-- The seat map needs to know which seats are taken without learning who took
-- them. `seats.status` used to answer that from a column; this is the same
-- derivation `create_hold` applies, exposed as rows. Own rows are already
-- known to the buyer through `seat_holds`/`orders`, which stay private.
drop view if exists public.seat_availability;
create view public.seat_availability as
select h.match_id, h.seat_id
from public.seat_holds h
where h.released_at is null
  and h.expires_at > now()
union
select os.match_id, os.seat_id
from public.order_seats os
join public.orders o on o.id = os.order_id
where o.status in ('pending', 'paid');

grant select on public.seat_availability to anon, authenticated;

-- ── the cached flag goes ────────────────────────────────────────────────────
-- Everything above no longer reads or writes it, so nothing is left to keep
-- in step. Dropping the column drops `seats_tenant_status_idx` with it.
alter table public.seats drop column if exists status;
drop type if exists public.seat_status;
