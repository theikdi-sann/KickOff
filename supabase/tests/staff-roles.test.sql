-- GAP-03a — staff roles: `admin` and `gatekeeper`.
--
-- D-20 scopes the product to exactly two staff roles. `admin` keeps every
-- privilege; a `gatekeeper` may scan passes and undo their own scans, and
-- nothing else. The role vocabulary lives in three places that must agree —
-- the `profiles.role` constraint, the JWT claim (`app_metadata.role`) and the
-- Edge Function guards — so the database half is proven here first.
--
--   SR-1  `is_staff()` exists and accepts both staff roles only
--   SR-2  `is_admin()` stays admin-only, so a gatekeeper is not an admin
--   SR-3  `profiles.role` accepts `gatekeeper` and still rejects anything else
--   SR-4  a gatekeeper may scan and undo their own scan — never another's, and
--         never under another user's name
--   SR-5  the gatekeeper's RLS boundary is the gate: gates are readable, the
--         scan log is own-rows-only, and every admin-only table stays closed
begin;
select plan(25);

-- ── fixtures ────────────────────────────────────────────────────────────────
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000c1', 'staff.admin@kickoff.test'),
  ('00000000-0000-0000-0000-0000000000c2', 'staff.gate@kickoff.test'),
  ('00000000-0000-0000-0000-0000000000c3', 'staff.fan@kickoff.test');

update public.profiles set role = 'admin'
  where id = '00000000-0000-0000-0000-0000000000c1';

-- ── SR-1 the helper exists ──────────────────────────────────────────────────
select has_function(
  'public', 'is_staff', array[]::text[],
  'SR-1a public.is_staff() exists'
);

-- ── SR-2 admin vs gatekeeper ────────────────────────────────────────────────
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated","app_metadata":{"role":"admin"}}',
  true
);
select is(public.is_admin(), true, 'SR-2a an admin claim is an admin');
select is(public.is_staff(), true, 'SR-2b an admin is staff');

select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000c2","role":"authenticated","app_metadata":{"role":"gatekeeper"}}',
  true
);
select is(public.is_admin(), false, 'SR-2c a gatekeeper is not an admin');
select is(public.is_staff(), true, 'SR-2d a gatekeeper is staff');

select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000c3","role":"authenticated","app_metadata":{"role":"customer"}}',
  true
);
select is(public.is_staff(), false, 'SR-2e a customer is not staff');

-- ── SR-3 the profile role vocabulary ────────────────────────────────────────
-- The service role writes the row; the point is the check constraint, not RLS.
select lives_ok(
  $$update public.profiles set role = 'gatekeeper'
      where id = '00000000-0000-0000-0000-0000000000c2'$$,
  'SR-3a profiles.role accepts gatekeeper'
);

select is(
  (select role from public.profiles where id = '00000000-0000-0000-0000-0000000000c2'),
  'gatekeeper',
  'SR-3b the gatekeeper row kept the new role'
);

select throws_ok(
  $$update public.profiles set role = 'owner'
      where id = '00000000-0000-0000-0000-0000000000c2'$$,
  '23514', null,
  'SR-3c an unknown role is still rejected'
);

-- ── SR-4 the gate surface ───────────────────────────────────────────────────
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000c4', 'staff.gate2@kickoff.test');

update public.profiles set role = 'gatekeeper'
  where id in (
    '00000000-0000-0000-0000-0000000000c2',
    '00000000-0000-0000-0000-0000000000c4'
  );

insert into public.matches (id, opponent, opponent_short, kickoff_at, status)
values ('staff-match', 'Gate FC', 'GAT', now() + interval '30 minutes', 'upcoming');

insert into public.zones (id, match_id, name, rows, seats_per_row)
values ('staff-zone', 'staff-match', 'Gate Stand', array['A']::text[], 2);

insert into public.match_zone_prices (match_id, zone_id, price_minor_units)
values ('staff-match', 'staff-zone', 35000);

insert into public.seats (id, zone_id, row_label, number) values
  ('staff-seat-1', 'staff-zone', 'A', 1),
  ('staff-seat-2', 'staff-zone', 'A', 2);

insert into public.orders (id, user_id, match_id, amount_minor_units, status, payment_intent_id) values
  ('staff-order', '00000000-0000-0000-0000-0000000000c3', 'staff-match', 35000, 'paid', 'pi_staff');

insert into public.order_seats (id, order_id, seat_id, match_id, zone_name, row_label, number, price_minor_units) values
  ('staff-os-1', 'staff-order', 'staff-seat-1', 'staff-match', 'Gate Stand', 'A', 1, 35000),
  ('staff-os-2', 'staff-order', 'staff-seat-2', 'staff-match', 'Gate Stand', 'A', 2, 35000);

insert into public.tickets (id, order_id, order_seat_id, user_id, match_id, seat_id, status) values
  ('staff-ticket-1', 'staff-order', 'staff-os-1',
   '00000000-0000-0000-0000-0000000000c3', 'staff-match', 'staff-seat-1', 'valid'),
  ('staff-ticket-2', 'staff-order', 'staff-os-2',
   '00000000-0000-0000-0000-0000000000c3', 'staff-match', 'staff-seat-2', 'valid');

insert into public.gates (id, name, match_id, active)
values ('staff-gate', 'Gate A', 'staff-match', true);

-- Gatekeeper A admits a valid pass.
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000c2","role":"authenticated","app_metadata":{"role":"gatekeeper"}}',
  true
);
set local role authenticated;

select is(
  (public.scan_ticket(
    'staff-ticket-1', 'staff-gate',
    '00000000-0000-0000-0000-0000000000c2', 'staff-key-1'
  ) ->> 'code'),
  'valid',
  'SR-4a a gatekeeper can admit a valid pass'
);

reset role;

select is(
  (select admin_id from public.scan_events where idempotency_key = 'staff-key-1'),
  '00000000-0000-0000-0000-0000000000c2'::uuid,
  'SR-4b the scan is recorded against the gatekeeper'
);

select set_config(
  'staff.scan_event_id',
  (select id from public.scan_events where idempotency_key = 'staff-key-1'),
  true
);

-- Gatekeeper B may not undo gatekeeper A's admission.
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000c4","role":"authenticated","app_metadata":{"role":"gatekeeper"}}',
  true
);
set local role authenticated;

select throws_ok(
  $$select public.undo_scan(
      current_setting('staff.scan_event_id'),
      '00000000-0000-0000-0000-0000000000c4',
      'staff-gate'
    )$$,
  '42501', null,
  'SR-4c another gatekeeper cannot undo the scan'
);

reset role;

-- Gatekeeper A undoes their own admission.
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000c2","role":"authenticated","app_metadata":{"role":"gatekeeper"}}',
  true
);
set local role authenticated;

select is(
  (public.undo_scan(
    current_setting('staff.scan_event_id'),
    '00000000-0000-0000-0000-0000000000c2',
    'staff-gate'
  ) ->> 'ok'),
  'true',
  'SR-4d the gatekeeper can undo their own scan'
);

reset role;

select is(
  (select status from public.tickets where id = 'staff-ticket-1'),
  'valid'::public.ticket_status,
  'SR-4e the undo restored the pass'
);

-- A caller may not write a scan under someone else's identity.
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000c2","role":"authenticated","app_metadata":{"role":"gatekeeper"}}',
  true
);
set local role authenticated;

select throws_ok(
  $$select public.scan_ticket(
      'staff-ticket-2', 'staff-gate',
      '00000000-0000-0000-0000-0000000000c4', 'staff-key-2'
    )$$,
  '42501', null,
  'SR-4f a scan cannot be attributed to another user'
);

reset role;

select is(
  (select status from public.tickets where id = 'staff-ticket-2'),
  'valid'::public.ticket_status,
  'SR-4g the refused attribution left the pass untouched'
);

-- A customer has no gate authority.
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000c3","role":"authenticated","app_metadata":{"role":"customer"}}',
  true
);
set local role authenticated;

select throws_ok(
  $$select public.scan_ticket(
      'staff-ticket-2', 'staff-gate',
      '00000000-0000-0000-0000-0000000000c3', 'staff-key-3'
    )$$,
  '42501', null,
  'SR-4h a customer cannot scan'
);

reset role;

-- An admin keeps the full gate authority.
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated","app_metadata":{"role":"admin"}}',
  true
);
set local role authenticated;

select is(
  (public.scan_ticket(
    'staff-ticket-2', 'staff-gate',
    '00000000-0000-0000-0000-0000000000c1', 'staff-key-4'
  ) ->> 'code'),
  'valid',
  'SR-4i an admin can still scan'
);

reset role;

-- ── SR-5 the RLS boundary ───────────────────────────────────────────────────
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000c2","role":"authenticated","app_metadata":{"role":"gatekeeper"}}',
  true
);
set local role authenticated;

select is(
  (select count(*) from public.gates where id = 'staff-gate'),
  1::bigint,
  'SR-5a a gatekeeper can read the gate registry to choose a gate'
);

select is(
  (select count(*) from public.scan_events),
  1::bigint,
  'SR-5b a gatekeeper sees only their own scan events'
);

select is(
  (select count(*) from public.audit_logs),
  0::bigint,
  'SR-5c a gatekeeper cannot read the audit trail'
);

select is(
  (select count(*) from public.profiles),
  1::bigint,
  'SR-5d a gatekeeper sees only their own profile'
);

-- RLS silently filters the row, so the write is a no-op rather than an error.
update public.gates set name = 'Hijacked' where id = 'staff-gate';

reset role;

select is(
  (select name from public.gates where id = 'staff-gate'),
  'Gate A',
  'SR-5e a gatekeeper cannot write the gate registry'
);

-- The gate log shows the fixture and seat of an entry, which requires the
-- ticket row — but only for a pass this gatekeeper scanned.
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000c2","role":"authenticated","app_metadata":{"role":"gatekeeper"}}',
  true
);
set local role authenticated;

select is(
  (select count(*) from public.tickets where id = 'staff-ticket-1'),
  1::bigint,
  'SR-5f a gatekeeper can read the ticket they scanned'
);

select is(
  (select count(*) from public.tickets where id = 'staff-ticket-2'),
  0::bigint,
  'SR-5g a gatekeeper cannot read a ticket they never scanned'
);

reset role;

select * from finish();
rollback;
