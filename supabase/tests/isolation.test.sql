-- 0045 / C7.3 — tenant isolation: the RLS matrix proves club B cannot touch
-- club A (GAP-02, ADR-002).
--
-- The tenancy series added `tenant_id` columns and composite foreign keys
-- (0042); this suite is the *behaviour* half of the proof: for every scoped
-- table a second club's staff read 0 rows, their writes affect 0 rows or
-- raise, capabilities come from a membership rather than from the legacy role
-- claim, and a cross-tenant composite-FK insert fails even for the table
-- owner. The harness sets `request.jwt.claims` per simulated user, exactly as
-- `rls-auth.test.sql` does.
--
--   T-01..T-05  helpers and own rows — who is admin where, and that a fan's
--               own-row read belongs to the club their token claims
--   T-06..T-17  reads — the second club's staff see none of the first club's
--               scoped rows (and only their own club's rows at all)
--   T-18..T-21  writes — a cross-tenant insert raises, an update or delete
--               affects 0 rows, and the append-only grants are gone
--   T-22..T-24  structure and the gate — a cross-tenant assignment fails at
--               the foreign key even as the owner, a foreign gatekeeper
--               cannot scan, and the refund ledger of another club is closed
begin;
select plan(24);

-- ── the second club ─────────────────────────────────────────────────────────
-- Provisioned through the real entry point so its `admin` / `gatekeeper`
-- vocabulary (capability flags) comes into existence the same way it would
-- for a paying customer.
select public.provision_tenant('Iso Second Club', 'iso-second');

-- ── people ──────────────────────────────────────────────────────────────────
-- Club-B staff arrive with no role claim on purpose: their authority is the
-- `staff_members` row below, not anything on the token. The club-A staff
-- member is promoted through `profiles.role`, which is what the dual-write
-- bridge mirrors into a membership.
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000f9', 'iso.admin.b@kickoff.test'),
  ('00000000-0000-0000-0000-0000000000f8', 'iso.gate.b@kickoff.test'),
  ('00000000-0000-0000-0000-0000000000f7', 'iso.fan.a@kickoff.test'),
  ('00000000-0000-0000-0000-0000000000f5', 'iso.staff.a@kickoff.test');

update public.profiles set role = 'admin'
  where id = '00000000-0000-0000-0000-0000000000f5';

insert into public.staff_members (id, tenant_id, staff_role)
select u.id, t.id, u.claim
from (
  values
    ('00000000-0000-0000-0000-0000000000f9'::uuid, 'admin'),
    ('00000000-0000-0000-0000-0000000000f8'::uuid, 'gatekeeper')
) as u (id, claim)
cross join public.tenants t
where t.slug = 'iso-second';

-- ── club A's rows (the ones club B must never see) ──────────────────────────
insert into public.matches (id, opponent, opponent_short, kickoff_at, status)
values ('iso-match-a', 'Iso FC A', 'ISA', now() + interval '1 hour', 'upcoming');

insert into public.zones (id, match_id, name, rows, seats_per_row)
values ('iso-zone-a', 'iso-match-a', 'Iso Stand', array['A']::text[], 2);

insert into public.match_zone_prices (match_id, zone_id, price_minor_units)
values ('iso-match-a', 'iso-zone-a', 35000);

insert into public.seats (id, zone_id, row_label, number) values
  ('iso-seat-a1', 'iso-zone-a', 'A', 1),
  ('iso-seat-a2', 'iso-zone-a', 'A', 2);

insert into public.orders (id, user_id, match_id, amount_minor_units, status)
values ('iso-order-a', '00000000-0000-0000-0000-0000000000f7',
        'iso-match-a', 35000, 'paid');

insert into public.order_seats
  (id, order_id, seat_id, match_id, zone_name, row_label, number, price_minor_units)
values
  ('iso-os-a', 'iso-order-a', 'iso-seat-a1', 'iso-match-a', 'Iso Stand', 'A', 1, 35000);

insert into public.tickets
  (id, order_id, order_seat_id, user_id, match_id, seat_id, status)
values
  ('iso-ticket-a', 'iso-order-a', 'iso-os-a',
   '00000000-0000-0000-0000-0000000000f7', 'iso-match-a', 'iso-seat-a1', 'valid');

insert into public.seat_holds
  (id, hold_group_id, seat_id, user_id, expires_at, match_id)
values
  ('iso-hold-a', 'iso-hold-group-a', 'iso-seat-a2',
   '00000000-0000-0000-0000-0000000000f7', now() + interval '10 minutes', 'iso-match-a');

-- One gate the fixture is assigned to, one with no assignment at all (so a
-- cross-tenant DELETE can be observed as "0 rows" instead of tripping a
-- foreign key that would mask the policy result).
insert into public.gates (id, name, venue_id, active) values
  ('iso-gate-a', 'Iso Gate A', 'v_kickoff', true),
  ('iso-gate-bare', 'Iso Bare Gate', 'v_kickoff', true);

insert into public.match_gates (match_id, gate_id)
values ('iso-match-a', 'iso-gate-a');

insert into public.scan_events
  (ticket_id, raw_hash, result, gate_id, admin_id, idempotency_key, match_id)
values
  ('iso-ticket-a', 'iso-hash-a', 'valid', 'iso-gate-a',
   '00000000-0000-0000-0000-0000000000f7', 'iso-key-1', 'iso-match-a');

insert into public.audit_logs (actor_id, action, entity, entity_id)
values ('00000000-0000-0000-0000-0000000000f7', 'iso.test', 'matches', 'iso-match-a');

insert into public.refunds
  (id, order_id, tenant_id, amount_minor_units, currency,
   override_used_tickets, used_tickets)
values
  ('iso-refund-a', 'iso-order-a', '00000000-0000-0000-0000-000000000001',
   35000, 'THB', false, 0);

insert into public.news_items
  (id, title, excerpt, body, category, published_at, read_minutes, image_colors)
values
  ('iso-news-draft', 'Unpublished draft', 'Only the home club may draft.',
   'A draft that belongs to club A.', 'Club News',
   now() + interval '2 days', 1, array['#000000']::text[]);

-- ── club B's rows (the ones its own staff must see) ─────────────────────────
insert into public.venues (id, name, tenant_id)
select 'iso-venue-b', 'Iso Arena B', t.id from public.tenants t
where t.slug = 'iso-second';

insert into public.gates (id, name, venue_id, tenant_id, active)
select 'iso-gate-b', 'Iso Gate B', 'iso-venue-b', t.id, true from public.tenants t
where t.slug = 'iso-second';

-- ── T-01..T-05 helpers and own rows ─────────────────────────────────────────
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', '00000000-0000-0000-0000-0000000000f9',
    'role', 'authenticated',
    'app_metadata', jsonb_build_object(
      'role', 'admin',
      'tenant_id', (select id from public.tenants where slug = 'iso-second')
    )
  )::text,
  true
);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000f9', true);

select is(
  public.is_admin(),
  true,
  'T-01 the second club''s admin is an admin of their own club'
);

-- The same person, the first club's claim: membership is per club.
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000f9","role":"authenticated","app_metadata":{"role":"admin","tenant_id":"00000000-0000-0000-0000-000000000001"}}',
  true
);

select is(
  public.is_admin(),
  false,
  'T-02 an admin of one club is not an admin of another'
);

-- A token that still carries the legacy role claim but no membership.
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000f7","role":"authenticated","app_metadata":{"role":"admin","tenant_id":"00000000-0000-0000-0000-000000000001"}}',
  true
);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000f7', true);

select is(
  public.is_admin(),
  false,
  'T-03 the legacy role claim grants no capability — membership does'
);

-- From here the reads run as a member, not as the table owner: RLS is
-- bypassed by `postgres`, so the counts below only mean anything under the
-- `authenticated` role. Claims keep being set inside the role (set_config is
-- not restricted), exactly as the harness will in production.
set local role authenticated;

select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000f7","role":"authenticated","app_metadata":{"role":"customer","tenant_id":"00000000-0000-0000-0000-000000000001"}}',
  true
);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000f7', true);

select is(
  (select count(*) from public.orders),
  1::bigint,
  'T-04 a fan with their club''s claim reads their own order'
);

select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', '00000000-0000-0000-0000-0000000000f7',
    'role', 'authenticated',
    'app_metadata', jsonb_build_object(
      'role', 'customer',
      'tenant_id', (select id from public.tenants where slug = 'iso-second')
    )
  )::text,
  true
);

select is(
  (select count(*) from public.orders),
  0::bigint,
  'T-05 the same fan under another club''s claim sees no club A rows'
);

-- ── T-06..T-17 the second club reads none of the first club's rows ──────────
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', '00000000-0000-0000-0000-0000000000f9',
    'role', 'authenticated',
    'app_metadata', jsonb_build_object(
      'role', 'admin',
      'tenant_id', (select id from public.tenants where slug = 'iso-second')
    )
  )::text,
  true
);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000f9', true);

select is(
  (select count(*) from public.orders),
  0::bigint,
  'T-06 another club''s orders are invisible'
);
select is(
  (select count(*) from public.tickets),
  0::bigint,
  'T-07 another club''s passes are invisible'
);
select is(
  (select count(*) from public.seat_holds),
  0::bigint,
  'T-08 another club''s holds are invisible'
);
select is(
  (select count(*) from public.order_seats),
  0::bigint,
  'T-09 another club''s order lines are invisible'
);
select is(
  (select count(*) from public.scan_events),
  0::bigint,
  'T-10 another club''s scan log is invisible'
);
select is(
  (select count(*) from public.audit_logs),
  0::bigint,
  'T-11 another club''s audit trail is invisible'
);
select is(
  (select count(*) from public.app_settings),
  0::bigint,
  'T-12 another club''s settings are invisible'
);
select is(
  (select count(*) from public.staff_members),
  2::bigint,
  'T-13 only this club''s staff memberships are visible'
);
select is(
  (select count(*) from public.staff_roles),
  2::bigint,
  'T-14 only this club''s role vocabulary is visible'
);
select is(
  (select count(*) from public.gates),
  1::bigint,
  'T-15 only this club''s gates are visible'
);
select is(
  (select count(*) from public.match_gates),
  0::bigint,
  'T-16 another club''s fixture assignments are invisible'
);
select is(
  (select count(*) from public.news_items where published_at > now()),
  0::bigint,
  'T-17 another club''s unpublished news is invisible'
);

reset role;

-- ── T-18..T-21 the second club cannot write the first club's rows ───────────
set local role authenticated;

select throws_ok(
  $$ insert into public.matches (id, opponent, opponent_short, kickoff_at, tenant_id)
     values ('iso-hacked', 'Hacked FC', 'HKD', now() + interval '1 day',
             '00000000-0000-0000-0000-000000000001') $$,
  '42501', null,
  'T-18 a cross-tenant insert is refused by the policy'
);

-- The writes themselves are top-level statements (a data-modifying CTE cannot
-- nest inside `is()`); the row's final state is the observable result of the
-- attempt, checked after the role is reset.
update public.matches set opponent = 'Hijacked FC' where id = 'iso-match-a';
delete from public.gates where id = 'iso-gate-bare';

reset role;

select is(
  (select opponent from public.matches where id = 'iso-match-a'),
  'Iso FC A',
  'T-19 a cross-tenant update affects 0 rows'
);

select is(
  (select count(*) from public.gates where id = 'iso-gate-bare'),
  1::bigint,
  'T-20 a cross-tenant delete affects 0 rows'
);

select ok(
  not has_table_privilege('authenticated', 'public.audit_logs', 'update')
  and not has_table_privilege('authenticated', 'public.scan_events', 'insert')
  and not has_table_privilege('authenticated', 'public.scan_events', 'update')
  and not has_table_privilege('authenticated', 'public.scan_events', 'delete')
  and has_table_privilege('authenticated', 'public.refunds', 'select'),
  'T-21 the evidence tables carry no write grant and the ledger reads'
);

-- ── T-22..T-24 structure and the gate ───────────────────────────────────────
-- RLS cannot be the only thing between clubs: a composite foreign key fails
-- even for the table owner (service role, or postgres running the suite).
select throws_ok(
  $$ insert into public.match_gates (match_id, gate_id, tenant_id)
     values ('iso-match-a', 'iso-gate-b',
             (select id from public.tenants where slug = 'iso-second')) $$,
  '23503', null,
  'T-22 a cross-tenant assignment fails at the foreign key, even as the owner'
);

select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', '00000000-0000-0000-0000-0000000000f8',
    'role', 'authenticated',
    'app_metadata', jsonb_build_object(
      'role', 'gatekeeper',
      'tenant_id', (select id from public.tenants where slug = 'iso-second')
    )
  )::text,
  true
);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000f8', true);

set local role authenticated;

select throws_ok(
  $$ select public.scan_ticket(
      'iso-ticket-a', 'iso-gate-a',
      '00000000-0000-0000-0000-0000000000f8', 'iso-key-t23') $$,
  '42501', 'Staff only',
  'T-23 a gatekeeper cannot operate another club''s gate'
);

reset role;

-- The refund ledger needs the grant before it can be read at all, so this
-- assertion runs last: without it the query is a permission error rather than
-- a count of zero.
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', '00000000-0000-0000-0000-0000000000f9',
    'role', 'authenticated',
    'app_metadata', jsonb_build_object(
      'role', 'admin',
      'tenant_id', (select id from public.tenants where slug = 'iso-second')
    )
  )::text,
  true
);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000f9', true);

set local role authenticated;

select is(
  (select count(*) from public.refunds),
  0::bigint,
  'T-24 another club''s refund ledger is invisible'
);

reset role;

select * from finish();
rollback;
