-- 0040 — the tenant row and the tenancy helpers (C6.1).
--
-- The suite proves the parts the later migrations depend on:
--   * the default club row exists (0042 backfills to it);
--   * `current_tenant()` resolves the JWT claim, refuses a suspended club and
--     ignores a malformed claim instead of raising;
--   * `minor_units()` agrees with the shared scale for every currency;
--   * `provision_tenant()` is idempotent, platform-operator only (0054) and
--     validates the club's time zone (0053);
--   * `tenants` is read-only for members (no write grant, no write policy).
begin;
select plan(27);

-- ── structure ───────────────────────────────────────────────────────────────
select has_table('public', 'tenants', 'tenants table exists');

select enum_has_labels(
  'public',
  'tenant_status',
  array['active', 'suspended'],
  'tenant_status is active | suspended'
);

select ok(
  (select relrowsecurity from pg_class where oid = 'public.tenants'::regclass),
  'RLS is enabled on tenants'
);

-- ── the existing single club ────────────────────────────────────────────────
select is(
  (select count(*) from public.tenants
    where id = '00000000-0000-0000-0000-000000000001' and slug = 'kickoff'),
  1::bigint,
  'the default club row exists for the 0042 backfill'
);

-- ── current_tenant() ────────────────────────────────────────────────────────
-- No claim yet: every session carries none until the white-label `bootstrap`
-- writes one (ADR-004), so absence resolves to the club this deployment
-- serves — otherwise the single-club product would deny itself every row
-- (0045). A claim that *is* present stays strict; the two cases below pin
-- that boundary.
select is(
  public.current_tenant(),
  '00000000-0000-0000-0000-000000000001'::uuid,
  'no claim means the club this deployment serves'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated","app_metadata":{"tenant_id":"00000000-0000-0000-0000-000000000001"}}',
  true
);

select is(
  public.current_tenant(),
  '00000000-0000-0000-0000-000000000001'::uuid,
  'the claim resolves to the active club'
);

-- A suspended club keeps its rows but loses every helper.
insert into public.tenants (id, name, slug, status)
values ('00000000-0000-0000-0000-000000000002', 'Suspended FC', 'suspended-fc', 'suspended');

select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000c2","role":"authenticated","app_metadata":{"tenant_id":"00000000-0000-0000-0000-000000000002"}}',
  true
);

select ok(public.current_tenant() is null, 'a suspended club resolves to no tenant');

-- A claim is client-controlled data: a malformed value must not raise from
-- inside an RLS predicate.
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000c3","role":"authenticated","app_metadata":{"tenant_id":"not-a-uuid"}}',
  true
);

select ok(public.current_tenant() is null, 'a malformed claim resolves to no tenant');

-- ── minor_units() parity with the shared scale ──────────────────────────────
select is(
  (select count(*)
     from (values
       -- three decimals
       ('BHD', 3), ('IQD', 3), ('JOD', 3), ('KWD', 3),
       ('LYD', 3), ('OMR', 3), ('TND', 3),
       -- zero decimals
       ('BIF', 0), ('CLP', 0), ('DJF', 0), ('GNF', 0), ('ISK', 0), ('JPY', 0),
       ('KMF', 0), ('KRW', 0), ('PYG', 0), ('RWF', 0), ('UGX', 0), ('UYI', 0),
       ('VND', 0), ('VUV', 0), ('XAF', 0), ('XOF', 0), ('XPF', 0),
       -- the default
       ('THB', 2), ('USD', 2), ('EUR', 2)
     ) as expected(code, scale)
    where public.minor_units(expected.code) <> expected.scale),
  0::bigint,
  'minor_units agrees with the shared scale for every currency'
);

select is(public.minor_units('THB'), 2, 'THB has two decimals');
select is(public.minor_units('jpy'), 0, 'JPY has no decimals (case-insensitive)');
select is(public.minor_units('KWD'), 3, 'KWD has three decimals');
select is(public.minor_units('ZZZ'), 2, 'an unknown but well-formed code falls back to two decimals');

select throws_ok(
  $$ select public.minor_units('BAHT') $$,
  '22023',
  null,
  'minor_units rejects a code that is not three letters'
);

-- ── provision_tenant() ──────────────────────────────────────────────────────
-- A member is refused by the guard inside (0054) — behaviourally, not by an
-- ACL: the console holds EXECUTE so a platform admin can provision, and the
-- guard is what keeps a plain member out.
select throws_ok(
  $$select public.provision_tenant('Rogue FC', 'rogue-fc')$$,
  '42501', null,
  'provision_tenant refuses a member'
);

-- Provisioning is a platform operation (0054): the service role runs it.
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

select is(
  public.provision_tenant('Second FC', 'second-fc'),
  public.provision_tenant('Second FC', 'second-fc'),
  'provision_tenant is idempotent by slug'
);

select is(
  (select count(*) from public.tenants where slug = 'second-fc'),
  1::bigint,
  're-provisioning does not create a second club'
);

select ok(
  has_function_privilege(
    'service_role',
    'public.provision_tenant(text,text,text,text,text)',
    'execute'
  ),
  'provision_tenant is callable by the service role'
);

-- ── the club's time zone (0053, C8.2c) ──────────────────────────────────────
-- Every kickoff, reminder and formatted date is a wall-clock time somewhere:
-- the club says where, so a club in London does not see 18:00 Bangkok.
select is(
  (select timezone from public.tenants where slug = 'kickoff'),
  'Asia/Bangkok',
  'the default club runs in Asia/Bangkok'
);

select is(
  (select timezone from public.tenants where slug = 'second-fc'),
  'Asia/Bangkok',
  'a newly provisioned club gets the default time zone'
);

-- Two statements, not one: the outer query runs on the statement's snapshot,
-- which cannot see a row the inner call inserts in the same statement.
select public.provision_tenant('Zone FC', 'zone-fc', 'GBP', 'en-GB', 'Europe/London');

select is(
  (select timezone from public.tenants where slug = 'zone-fc'),
  'Europe/London',
  'provision_tenant sets the club time zone'
);

-- Leave the fixture count as the RLS tests below expect it (two clubs).
delete from public.tenants where slug = 'zone-fc';

select throws_ok(
  $$select public.provision_tenant('Mars FC', 'mars-fc', 'USD', 'en-US', 'Mars/Olympus')$$,
  '22023', null,
  'provision_tenant refuses a time zone the database does not know'
);

-- ── RLS ─────────────────────────────────────────────────────────────────────
-- Active clubs are public branding; a suspended club is not, and the
-- commercial columns (fee, Connect account) are not part of the public profile.
select ok(
  has_column_privilege('anon', 'public.tenants', 'name', 'select'),
  'anon can read the branding columns'
);

select ok(
  not has_column_privilege('anon', 'public.tenants', 'application_fee_bps', 'select'),
  'anon cannot read the platform fee'
);

set local role anon;

select is(
  (select count(*) from public.tenants),
  2::bigint,
  'anon reads only the active clubs'
);

select throws_ok(
  $$ insert into public.tenants (name, slug) values ('Rogue FC', 'rogue-fc') $$,
  '42501',
  null,
  'anon cannot create a club'
);

reset role;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated","app_metadata":{"tenant_id":"00000000-0000-0000-0000-000000000001"}}',
  true
);

select throws_ok(
  $$ update public.tenants set name = 'Hijacked FC'
      where id = '00000000-0000-0000-0000-000000000001' $$,
  '42501',
  null,
  'an authenticated member cannot rename a club'
);

reset role;

select * from finish();
rollback;
