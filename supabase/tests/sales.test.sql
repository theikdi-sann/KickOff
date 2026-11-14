-- 0043 — the sales restructure (C7.1).
--
-- The suite proves the target commerce shape (D-26, ADR-002/003):
--   * a seat is physical inventory with no status column — occupancy comes
--     from an active hold or a live order line, never from a cached flag;
--   * the price lives per (match, zone) in `match_zone_prices`, not on the
--     zone, and the order snapshots amount + currency + platform fee;
--   * money columns are minor units, named as such;
--   * a seat can only be sold once per order, a line can only carry one
--     ticket, and a refund is a ledger row, not just a status flip.
begin;
select plan(28);

-- ── structure ───────────────────────────────────────────────────────────────
select ok(
  not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'seats' and column_name = 'status'
  ),
  'seats carry no status column'
);

select ok(
  not exists (
    select 1
    from pg_type t join pg_namespace n on n.oid = t.typnamespace
    where t.typname = 'seat_status' and n.nspname = 'public'
  ),
  'the seat_status enum is gone'
);

select ok(
  not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'zones' and column_name = 'price_satang'
  ),
  'zones no longer carry a price'
);

select ok(
  exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'match_zone_prices'
      and column_name = 'price_minor_units' and data_type = 'integer'
  ),
  'match_zone_prices carries the price in minor units'
);

select ok(
  exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'orders'
      and column_name = 'amount_minor_units'
  )
  and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'orders'
      and column_name = 'amount_satang'
  ),
  'the order amount is named as a minor-unit amount'
);

select ok(
  exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'orders'
      and column_name = 'currency'
      and is_nullable = 'NO'
  )
  and exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'orders'
      and column_name = 'application_fee_amount'
      and is_nullable = 'NO'
  ),
  'an order snapshots its currency and the platform fee'
);

select ok(
  not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'order_seats'
      and column_name = 'price_satang'
  )
  and exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'order_seats'
      and column_name = 'match_id' and is_nullable = 'NO'
  ),
  'an order line carries its match and a minor-unit price'
);

select ok(
  exists (
    select 1 from pg_constraint
    where conrelid = 'public.order_seats'::regclass
      and contype = 'u'
      and conkey = array[
        (select attnum from pg_attribute
          where attrelid = 'public.order_seats'::regclass and attname = 'order_id'),
        (select attnum from pg_attribute
          where attrelid = 'public.order_seats'::regclass and attname = 'seat_id')
      ]
  ),
  'the same seat cannot appear twice in one order'
);

select ok(
  exists (
    select 1 from pg_constraint
    where conrelid = 'public.tickets'::regclass
      and contype = 'u'
      and conkey = array[
        (select attnum from pg_attribute
          where attrelid = 'public.tickets'::regclass and attname = 'order_seat_id')
      ]
  ),
  'an order line issues at most one ticket'
);

select ok(
  exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'seat_holds'
      and column_name = 'match_id' and is_nullable = 'NO'
  ),
  'a hold names the match it is for'
);

select ok(
  exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'refunds'
      and column_name = 'amount_minor_units'
      and is_nullable = 'NO'
  ),
  'a refund is a ledger row with a minor-unit amount'
);

-- ── fixtures ────────────────────────────────────────────────────────────────
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000f1', 'sales-a@kickoff.test'),
  ('00000000-0000-0000-0000-0000000000f2', 'sales-b@kickoff.test')
on conflict (id) do nothing;

insert into public.matches (id, opponent, opponent_short, kickoff_at)
values ('sales-match', 'Sales FC', 'SLS', now() + interval '7 days')
on conflict do nothing;

insert into public.zones (id, match_id, name, rows, seats_per_row)
values ('sales-zone', 'sales-match', 'S Stand', array['A']::text[], 3)
on conflict do nothing;

insert into public.match_zone_prices (match_id, zone_id, price_minor_units)
values ('sales-match', 'sales-zone', 35000)
on conflict (match_id, zone_id) do nothing;

insert into public.seats (id, zone_id, row_label, number) values
  ('sales-s1', 'sales-zone', 'A', 1),
  ('sales-s2', 'sales-zone', 'A', 2),
  ('sales-s3', 'sales-zone', 'A', 3)
on conflict do nothing;

select is(
  (select price_minor_units from public.match_zone_prices
    where match_id = 'sales-match' and zone_id = 'sales-zone'),
  35000,
  'the zone price lives on the (match, zone) row'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000f1","role":"authenticated","app_metadata":{"role":"customer"}}',
  true
);

-- ── occupancy without a status column ──────────────────────────────────────
select ok(
  public.create_hold('sales-match', array['sales-s1']) is not null,
  'a free seat can be held'
);

select throws_ok(
  $$ select public.create_hold('sales-match', array['sales-s1']) $$,
  '23505',
  null,
  'a seat under an active hold cannot be held again'
);

select public.create_order_from_hold(
  (select hold_group_id from public.seat_holds where seat_id = 'sales-s1')
) as o1 \gset

select throws_ok(
  $$ select public.create_hold('sales-match', array['sales-s1']) $$,
  '23505',
  null,
  'a pending order reserves its seat with no status flag to flip'
);

select public.cancel_order(:'o1'::jsonb ->> 'id',
  '00000000-0000-0000-0000-0000000000f1'::uuid) as c1 \gset

select is(
  (select count(*) from public.seats s
    where s.id = 'sales-s1'
      and not exists (
        select 1 from public.seat_holds h
        where h.seat_id = s.id and h.released_at is null and h.expires_at > now()
      )
      and not exists (
        select 1 from public.order_seats os
        join public.orders o on o.id = os.order_id
        where os.seat_id = s.id and o.status in ('pending', 'paid')
      )),
  1::bigint,
  'a cancelled order returns its seat to sale'
);

select public.create_hold('sales-match', array['sales-s1']) as h2 \gset
select public.create_order_from_hold(:'h2'::jsonb ->> 'id') as o2 \gset
select public.mark_order_paid(:'o2'::jsonb ->> 'id', 'sess-sales-1', 'pi-sales-1') as paid \gset

select is(
  (select count(*) from public.seats s
    where s.id = 'sales-s1'
      and exists (
        select 1 from public.order_seats os
        join public.orders o on o.id = os.order_id
        where os.seat_id = s.id and o.status = 'paid'
      )),
  1::bigint,
  'a paid order keeps its seat taken'
);

select is(
  (select count(*) from public.zone_availability
    where zone_id = 'sales-zone' and available_seats = 2),
  1::bigint,
  'zone_availability counts occupancy from holds and live orders'
);

-- ── pricing ─────────────────────────────────────────────────────────────────
select is(
  (select amount_minor_units from public.orders where id = :'o2'::jsonb ->> 'id'),
  35000,
  'the order is priced from match_zone_prices'
);

select is(
  (select currency from public.orders where id = :'o2'::jsonb ->> 'id'),
  'THB',
  'the order snapshots its currency'
);

select is(
  (select application_fee_amount from public.orders where id = :'o2'::jsonb ->> 'id'),
  0,
  'the platform fee is snapshotted with the tenant rate'
);

select is(
  (select match_id from public.order_seats
    where order_id = :'o2'::jsonb ->> 'id'),
  'sales-match',
  'an order line records the match it was sold for'
);

select is(
  (select count(*) from public.tickets where order_id = :'o2'::jsonb ->> 'id'),
  1::bigint,
  'payment issues exactly one ticket'
);

select throws_ok(
  format($$ insert into public.tickets
      (id, order_id, order_seat_id, user_id, match_id, seat_id, status)
    values (%L, %L, %L, %L, %L, %L, 'valid') $$,
    'tk-dup', :'o2'::jsonb ->> 'id',
    (select id from public.order_seats where order_id = :'o2'::jsonb ->> 'id'),
    '00000000-0000-0000-0000-0000000000f1', 'sales-match', 'sales-s1'),
  '23505',
  null,
  'the same order line cannot issue a second ticket'
);

-- D-26 at the seat level: a different order line for the same seat still
-- cannot issue a usable pass while one is live.
insert into public.orders (id, user_id, match_id, amount_minor_units, status)
values ('sales-other', '00000000-0000-0000-0000-0000000000f2', 'sales-match', 35000, 'cancelled');

insert into public.order_seats (id, order_id, seat_id, match_id, zone_name, row_label, number, price_minor_units)
values ('sales-other-os', 'sales-other', 'sales-s1', 'sales-match', 'S Stand', 'A', 1, 35000);

select throws_ok(
  $$ insert into public.tickets
       (id, order_id, order_seat_id, user_id, match_id, seat_id, status)
     values ('tk-live-dup', 'sales-other', 'sales-other-os',
             '00000000-0000-0000-0000-0000000000f2', 'sales-match', 'sales-s1', 'valid') $$,
  '23505',
  null,
  'only one live ticket can exist for a seat'
);

-- ── the refund ledger ──────────────────────────────────────────────────────
select public.mark_order_refunded(
  :'o2'::jsonb ->> 'id',
  '00000000-0000-0000-0000-0000000000f1'::uuid,
  're-sales-1'
) as ref1 \gset

select is(
  (select count(*) from public.refunds
    where order_id = :'o2'::jsonb ->> 'id' and id = 're-sales-1'),
  1::bigint,
  'a refund writes a ledger row'
);

select is(
  (select amount_minor_units from public.refunds where id = 're-sales-1'),
  35000,
  'the ledger row carries the refunded amount in minor units'
);

select public.mark_order_refunded(
  :'o2'::jsonb ->> 'id',
  '00000000-0000-0000-0000-0000000000f1'::uuid,
  're-sales-1'
) as ref2 \gset

select is(
  (select count(*) from public.refunds
    where order_id = :'o2'::jsonb ->> 'id'),
  1::bigint,
  'a replayed refund writes no second ledger row'
);

select * from finish();
rollback;
