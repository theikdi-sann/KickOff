-- 0044 / C7.2 — gate ops: a gate is physical, its fixtures are a join, and
-- the scan log is append-only.
--
-- F-4 stored the assigned fixture on the gate itself, which makes a gate a
-- one-fixture object: the same turnstile cannot serve two matchdays without
-- being rewritten, and the scan log could not say which fixture a scan
-- admitted for. This suite pins the shape 0044 introduces:
--
--   GO-1..GO-13  structure — gates bound to a venue, `match_gates` as the
--                assignment join, `scan_events` carrying `match_id`,
--                `operator_id` and `undone_by`, and the append-only trigger
--   GO-14..GO-19 assignment behaviour — one row per (fixture, gate), many
--                fixtures per gate, cascades, and a gate with no fixture
--                still refuses scans
--   GO-20..GO-28 scan/undo write the new columns: the fixture admitted for,
--                the operator's membership row and the undoer; a claim
--                without a membership cannot scan at all (GO-25)
--   GO-29..GO-36 the log is append-only — no direct edit, while foreign-key
--                cascades and an explicit maintenance session are the only
--                ways rows leave it
--   GO-37..GO-38 the staff read boundary over the assignment join
begin;
select plan(38);

-- ── fixtures ────────────────────────────────────────────────────────────────
-- A gatekeeper with a membership row, and an admin account that starts
-- without one: the admin claim alone must not open the gate (GO-25); GO-26
-- gives the account the membership its role implies and scans for real.
insert into auth.users (id, email, raw_app_meta_data) values
  ('00000000-0000-0000-0000-0000000000f1', 'go.gatekeeper@kickoff.test',
   '{"role":"gatekeeper"}'::jsonb),
  ('00000000-0000-0000-0000-0000000000f2', 'go.admin@kickoff.test',
   '{"role":"admin"}'::jsonb),
  ('00000000-0000-0000-0000-0000000000f3', 'go.fan@kickoff.test',
   '{"role":"customer"}'::jsonb);

update public.profiles set role = 'gatekeeper'
  where id = '00000000-0000-0000-0000-0000000000f1';

insert into public.venues (id, name)
values ('go-venue', 'Gate Ops Arena')
on conflict (id) do nothing;

insert into public.matches (id, opponent, opponent_short, kickoff_at, status, venue_id)
values
  ('go-m1', 'Fixture One FC', 'GO1', now() + interval '1 hour', 'upcoming', 'go-venue'),
  ('go-m2', 'Fixture Two FC', 'GO2', now() + interval '3 hours', 'upcoming', 'go-venue'),
  ('go-m3', 'Fixture Three FC', 'GO3', now() + interval '2 days', 'upcoming', 'go-venue')
on conflict (id) do nothing;

insert into public.zones (id, match_id, name, rows, seats_per_row)
values ('go-zone', 'go-m1', 'Gate Ops Stand', array['A']::text[], 2)
on conflict (id) do nothing;

insert into public.match_zone_prices (match_id, zone_id, price_minor_units)
values ('go-m1', 'go-zone', 35000)
on conflict (match_id, zone_id) do nothing;

insert into public.seats (id, zone_id, row_label, number) values
  ('go-seat-a1', 'go-zone', 'A', 1),
  ('go-seat-a2', 'go-zone', 'A', 2)
on conflict (id) do nothing;

insert into public.orders (id, user_id, match_id, amount_minor_units, status)
values
  ('go-order', '00000000-0000-0000-0000-0000000000f3', 'go-m1', 70000, 'paid'),
  ('go-order-2', '00000000-0000-0000-0000-0000000000f3', 'go-m1', 35000, 'paid')
on conflict (id) do nothing;

insert into public.order_seats
  (id, order_id, seat_id, match_id, zone_name, row_label, number, price_minor_units)
values
  ('go-os-1', 'go-order', 'go-seat-a1', 'go-m1', 'Gate Ops Stand', 'A', 1, 35000),
  ('go-os-2', 'go-order-2', 'go-seat-a2', 'go-m1', 'Gate Ops Stand', 'A', 2, 35000)
on conflict (id) do nothing;

insert into public.tickets (id, order_id, order_seat_id, user_id, match_id, seat_id, status)
values
  ('go-ticket', 'go-order', 'go-os-1',
   '00000000-0000-0000-0000-0000000000f3', 'go-m1', 'go-seat-a1', 'valid'),
  ('go-ticket-2', 'go-order-2', 'go-os-2',
   '00000000-0000-0000-0000-0000000000f3', 'go-m1', 'go-seat-a2', 'valid')
on conflict (id) do nothing;

insert into public.gates (id, name, venue_id, active) values
  ('go-gate-main', 'Go Main Gate', 'go-venue', true),
  ('go-gate-away', 'Go Away Gate', 'go-venue', true),
  ('go-gate-solo', 'Go Solo Gate', 'go-venue', true),
  ('go-gate-dark', 'Go Dark Gate', 'go-venue', true)
on conflict (id) do nothing;

insert into public.match_gates (match_id, gate_id) values
  ('go-m1', 'go-gate-main'),
  ('go-m2', 'go-gate-main'),
  ('go-m2', 'go-gate-away'),
  ('go-m3', 'go-gate-solo')
on conflict (match_id, gate_id) do nothing;

-- ── GO-1..GO-13 structure ───────────────────────────────────────────────────
select col_not_null(
  'public', 'gates', 'venue_id',
  'GO-1 a gate is bound to a venue'
);

select throws_ok(
  $$insert into public.gates (id, name) values ('go-nov', 'No Venue')$$,
  '23502', null,
  'GO-2 a gate cannot exist without a venue'
);

select has_table(
  'public', 'match_gates',
  'GO-3 the fixture assignment join exists'
);

select col_is_pk(
  'public', 'match_gates', array['match_id', 'gate_id'],
  'GO-4 a fixture is assigned to a gate at most once'
);

select ok(
  exists (
    select 1 from pg_constraint
    where conrelid = 'public.match_gates'::regclass
      and conname = 'match_gates_match_id_fkey'
      and confrelid = 'public.matches'::regclass
      and array_length(conkey, 1) = 2
      and confdeltype = 'c'
  ),
  'GO-5 assignments follow their fixture by composite foreign key'
);

select ok(
  exists (
    select 1 from pg_constraint
    where conrelid = 'public.match_gates'::regclass
      and conname = 'match_gates_gate_id_fkey'
      and confrelid = 'public.gates'::regclass
      and array_length(conkey, 1) = 2
      and confdeltype = 'c'
  ),
  'GO-6 assignments follow their gate by composite foreign key'
);

select ok(
  exists (
    select 1 from pg_constraint
    where conrelid = 'public.gates'::regclass
      and conname = 'gates_venue_id_fkey'
      and confrelid = 'public.venues'::regclass
      and array_length(conkey, 1) = 2
  ),
  'GO-7 the venue reference is a composite foreign key'
);

select hasnt_column(
  'public', 'gates', 'match_id',
  'GO-8 the gate no longer stores its fixture'
);

select ok(
  (select relrowsecurity from pg_class where oid = 'public.match_gates'::regclass),
  'GO-9 the assignment join is behind row level security'
);

select ok(
  exists (
    select 1 from pg_constraint
    where conrelid = 'public.scan_events'::regclass
      and conname = 'scan_events_operator_id_fkey'
      and confrelid = 'public.staff_members'::regclass
      and array_length(conkey, 1) = 2
      and confdeltype = 'n'
      and confdelsetcols = array[
        (select attnum from pg_attribute
          where attrelid = 'public.scan_events'::regclass and attname = 'operator_id')
      ]
  ),
  'GO-10 the scan names its operator by composite foreign key, cleared if the membership goes'
);

select ok(
  exists (
    select 1 from pg_constraint
    where conrelid = 'public.scan_events'::regclass
      and conname = 'scan_events_match_id_fkey'
      and confrelid = 'public.matches'::regclass
      and array_length(conkey, 1) = 2
      and confdeltype = 'n'
  ),
  'GO-11 the scan names its fixture by composite foreign key'
);

select ok(
  exists (
    select 1 from pg_constraint
    where conrelid = 'public.scan_events'::regclass
      and conname = 'scan_events_undone_by_fkey'
      and confrelid = 'public.staff_members'::regclass
      and array_length(conkey, 1) = 2
      and confdeltype = 'n'
  ),
  'GO-12 the undo names its undoer by composite foreign key'
);

select ok(
  exists (
    select 1 from pg_trigger
    where tgrelid = 'public.scan_events'::regclass
      and tgname = 'scan_events_append_only'
      and not tgisinternal
  ),
  'GO-13 the scan log carries an append-only trigger'
);

-- ── GO-14..GO-19 assignment behaviour ───────────────────────────────────────
select throws_ok(
  $$insert into public.match_gates (match_id, gate_id) values ('go-m1', 'go-gate-main')$$,
  '23505', null,
  'GO-14 a fixture is assigned to a gate at most once'
);

select is(
  (select count(*) from public.match_gates where gate_id = 'go-gate-main'),
  2::bigint,
  'GO-15 one gate covers several fixtures'
);

delete from public.matches where id = 'go-m3';

select is(
  (select count(*) from public.match_gates where match_id = 'go-m3'),
  0::bigint,
  'GO-16 deleting a fixture clears its assignments'
);

select is(
  (select count(*) from public.gates where id = 'go-gate-solo'),
  1::bigint,
  'GO-17 the gate survives its fixture'
);

select throws_ok(
  $$delete from public.venues where id = 'go-venue'$$,
  '23503', null,
  'GO-18 a venue with gates cannot be deleted'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000f1","role":"authenticated","app_metadata":{"role":"gatekeeper"}}',
  true
);
set local role authenticated;

select throws_ok(
  $$select public.scan_ticket('go-ticket', 'go-gate-dark',
      '00000000-0000-0000-0000-0000000000f1', 'go-key-4')$$,
  'P0001', 'Gate has no fixture assigned',
  'GO-19 a gate with no fixture refuses scans'
);

-- ── GO-20..GO-28 the scan and undo write the new columns ────────────────────
select is(
  (public.scan_ticket('go-ticket', 'go-gate-main',
     '00000000-0000-0000-0000-0000000000f1', 'go-key-1') ->> 'code'),
  'valid',
  'GO-20 the assigned gate admits the pass'
);

select is(
  (select match_id from public.scan_events where idempotency_key = 'go-key-1'),
  'go-m1',
  'GO-21 the scan records the fixture it admitted for'
);

select is(
  (select operator_id from public.scan_events where idempotency_key = 'go-key-1')::text,
  '00000000-0000-0000-0000-0000000000f1',
  'GO-22 the scan records the operator membership row'
);

select is(
  (public.scan_ticket('go-ticket', 'go-gate-away',
     '00000000-0000-0000-0000-0000000000f1', 'go-key-2') ->> 'code'),
  'wrong_match',
  'GO-23 a gate not assigned to the fixture refuses the pass'
);

select is(
  (select match_id from public.scan_events where idempotency_key = 'go-key-2'),
  'go-m1',
  'GO-24 the refused scan still records the fixture'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000f2","role":"authenticated","app_metadata":{"role":"admin"}}',
  true
);

select throws_ok(
  $$select public.scan_ticket('go-ticket-2', 'go-gate-main',
      '00000000-0000-0000-0000-0000000000f2', 'go-key-3')$$,
  '42501', null,
  'GO-25 an admin claim without a membership cannot scan'
);

-- The role implies the membership; give the account one and the same key
-- scans for real (GO-30..GO-34 depend on this event existing).
update public.profiles set role = 'admin'
  where id = '00000000-0000-0000-0000-0000000000f2';

select is(
  (public.scan_ticket('go-ticket-2', 'go-gate-main',
     '00000000-0000-0000-0000-0000000000f2', 'go-key-3') ->> 'code'),
  'valid',
  'GO-26 with a membership, the admin scans'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000f1","role":"authenticated","app_metadata":{"role":"gatekeeper"}}',
  true
);

select is(
  (public.undo_scan(
     (select id from public.scan_events where idempotency_key = 'go-key-1'),
     '00000000-0000-0000-0000-0000000000f1',
     'go-gate-main') ->> 'ok'),
  'true',
  'GO-27 the operator undoes their own scan'
);

select is(
  (select undone_by from public.scan_events where idempotency_key = 'go-key-1')::text,
  '00000000-0000-0000-0000-0000000000f1',
  'GO-28 the undo records who undid it'
);

reset role;

-- ── GO-29..GO-36 the log is append-only ─────────────────────────────────────
select throws_ok(
  $$delete from public.scan_events where idempotency_key = 'go-key-1'$$,
  '55000', null,
  'GO-29 the scan log cannot be deleted directly'
);

select throws_ok(
  $$update public.scan_events set result = 'used'
     where idempotency_key = 'go-key-3'$$,
  '55000', null,
  'GO-30 a scan result cannot be rewritten'
);

select throws_ok(
  $$update public.scan_events set undone_at = null
     where idempotency_key = 'go-key-1'$$,
  '55000', null,
  'GO-31 an undone entry cannot be touched again'
);

select lives_ok(
  $$update public.scan_events set undone_at = now()
     where idempotency_key = 'go-key-3'$$,
  'GO-32 the undo transition is the only editable state'
);

select lives_ok(
  $$delete from public.tickets where id = 'go-ticket-2'$$,
  'GO-33 a cascade from the ticket table is not an edit of the log'
);

select is(
  (select count(*) from public.scan_events where idempotency_key = 'go-key-3'),
  0::bigint,
  'GO-34 the cascade carried the entry away'
);

select set_config('kickoff.scan_events_maintenance', 'on', true);

select lives_ok(
  $$delete from public.scan_events where idempotency_key = 'go-key-2'$$,
  'GO-35 an explicit maintenance session can purge the log'
);

set local role service_role;

select throws_ok(
  $$delete from public.scan_events where idempotency_key = 'go-key-1'$$,
  '55000', null,
  'GO-36 the session flag alone does not let an API role purge the log'
);

reset role;
select set_config('kickoff.scan_events_maintenance', 'off', true);

-- ── GO-37..GO-38 the staff boundary over the join ───────────────────────────
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000f1","role":"authenticated","app_metadata":{"role":"gatekeeper"}}',
  true
);
set local role authenticated;

select is(
  (select count(*) from public.match_gates where gate_id = 'go-gate-main'),
  2::bigint,
  'GO-37 a gatekeeper reads the assignment join'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000f2","role":"authenticated","app_metadata":{"role":"admin"}}',
  true
);

select lives_ok(
  $$insert into public.match_gates (match_id, gate_id)
    values ('go-m1', 'go-gate-away')$$,
  'GO-38 an admin reassigns fixtures at the gate'
);

reset role;

select * from finish();
rollback;
