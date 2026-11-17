-- C9.1 — the platform authority (ADR-004 §3).
--
-- The platform console is a new surface with its own threat model: KickOff
-- staff provision clubs, set fee rates, suspend/restore tenants and read the
-- tenant *registry* — never a club's row-level data. The authority has two
-- projections, like every other tier (D-16's pattern):
--
--   * `public.platform_admins` — the membership the *database* reads
--     (`is_platform_admin()`);
--   * `auth.users.app_metadata.platform` — the claim the console proxy and
--     the Edge guards read.
--
-- `set_platform_admin()` writes both together and is the only writer of
-- either; every platform mutation is a guarded RPC (the `admin_update_match`
-- pattern), so the guard travels with the operation it protects.
--
--   PF-1…PF-8     the vocabulary: membership, operator, the grant and its
--                 refusal
--   PF-9…PF-12    suspend and the registry
--   PF-13…PF-16   refusals and validation
--   PF-17…PF-22   restore and the fee rate
--   PF-23…PF-24   provisioning: a member is refused, a platform admin may
--   PF-25…PF-28   the revoke
--   PF-29…PF-32   a tombstone (0052) is not an operable club
begin;
select plan(32);

-- ── fixtures ────────────────────────────────────────────────────────────────
-- f1 carries claims another tier owns (`role`, `tenant_id`): a grant must
-- merge the platform key, never replace the metadata.
insert into auth.users (id, email, raw_app_meta_data) values
  ('00000000-0000-0000-0000-0000000000f1', 'platform.admin@kickoff.test',
   '{"role":"admin","tenant_id":"keep-me"}'::jsonb),
  ('00000000-0000-0000-0000-0000000000f2', 'plain.member@kickoff.test',
   '{"role":"customer"}'::jsonb);

insert into public.tenants (name, slug, currency, application_fee_bps)
values ('Platform Test FC', 'platform-test-fc', 'THB', 250)
on conflict (slug) do nothing;

-- ── PF-1…PF-8 the vocabulary and the grant ──────────────────────────────────
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000f2","role":"authenticated"}',
  true
);

select is(
  public.is_platform_admin(),
  false,
  'PF-1 a user with no platform membership is not a platform admin'
);

select is(
  public.is_platform_operator(),
  false,
  'PF-2 a plain member is not a platform operator'
);

select set_config('request.jwt.claims', '{"role":"service_role"}', true);

select is(
  public.is_platform_operator(),
  true,
  'PF-3 the service role is a platform operator (Edge and the runbook)'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000f2","role":"authenticated"}',
  true
);

select throws_ok(
  $$select public.set_platform_admin('00000000-0000-0000-0000-0000000000f1', true)$$,
  '42501', null,
  'PF-4 only the service role may grant the platform authority'
);

reset role;

set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select public.set_platform_admin('00000000-0000-0000-0000-0000000000f1', true);
reset role;

select is(
  (select count(*) from public.platform_admins
    where user_id = '00000000-0000-0000-0000-0000000000f1'),
  1::bigint,
  'PF-5 the grant writes the platform membership row'
);

select is(
  (select raw_app_meta_data from auth.users
    where id = '00000000-0000-0000-0000-0000000000f1'),
  '{"role":"admin","tenant_id":"keep-me","platform":true}'::jsonb,
  'PF-6 the grant merges the platform claim — every other key survives'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000f1","role":"authenticated"}',
  true
);

select is(
  public.is_platform_admin(),
  true,
  'PF-7 the granted user is a platform admin'
);

select is(
  public.is_platform_operator(),
  true,
  'PF-8 a platform admin is a platform operator'
);

-- ── PF-9…PF-12 suspend and the registry ─────────────────────────────────────
select public.set_tenant_status(
  (select id from public.tenants where slug = 'platform-test-fc'),
  'suspended'
);
reset role;

select is(
  (select status from public.tenants where slug = 'platform-test-fc'),
  'suspended'::public.tenant_status,
  'PF-9 a platform admin may suspend a club'
);

select is(
  (select count(*) from public.audit_logs
    where action = 'tenant.status_changed'
      and entity = 'tenant'
      and entity_id = (select id::text from public.tenants
                        where slug = 'platform-test-fc')),
  1::bigint,
  'PF-10 the status change is audited'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000f1","role":"authenticated"}',
  true
);

-- The console must see suspended clubs: restoring one is its job.
select is(
  (select status from public.platform_tenants()
    where slug = 'platform-test-fc'),
  'suspended'::public.tenant_status,
  'PF-11 the registry includes a suspended club'
);

select is(
  (select application_fee_bps from public.platform_tenants()
    where slug = 'platform-test-fc'),
  250,
  'PF-12 the registry exposes the control columns'
);

-- ── PF-13…PF-16 refusals and validation ─────────────────────────────────────
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000f2","role":"authenticated"}',
  true
);

select throws_ok(
  $$select count(*) from public.platform_tenants()$$,
  '42501', null,
  'PF-13 a plain member may not read the platform registry'
);

select throws_ok(
  $$select public.set_tenant_status(
       '00000000-0000-0000-0000-000000000001', 'suspended')$$,
  '42501', null,
  'PF-14 a plain member may not suspend a club'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000f1","role":"authenticated"}',
  true
);

select throws_ok(
  $$select public.set_tenant_status(
       (select id from public.tenants where slug = 'platform-test-fc'),
       'deleted')$$,
  '22023', null,
  'PF-15 an unknown status is refused by name'
);

select throws_ok(
  $$select public.set_tenant_status(
       '00000000-0000-0000-0000-000000000099', 'active')$$,
  'P0002', null,
  'PF-16 an unknown club is refused'
);

reset role;

-- ── PF-17…PF-22 restore and the fee rate ────────────────────────────────────
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select public.set_tenant_status(
  (select id from public.tenants where slug = 'platform-test-fc'),
  'active'
);
reset role;

select is(
  (select status from public.tenants where slug = 'platform-test-fc'),
  'active'::public.tenant_status,
  'PF-17 the service role may restore the club'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000f1","role":"authenticated"}',
  true
);

select public.set_application_fee_bps(
  (select id from public.tenants where slug = 'platform-test-fc'),
  300
);
reset role;

select is(
  (select application_fee_bps from public.tenants
    where slug = 'platform-test-fc'),
  300,
  'PF-18 a platform admin may set the fee rate'
);

select is(
  (select count(*) from public.audit_logs
    where action = 'tenant.fee_changed'
      and entity = 'tenant'
      and entity_id = (select id::text from public.tenants
                        where slug = 'platform-test-fc')),
  1::bigint,
  'PF-19 the fee change is audited'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000f2","role":"authenticated"}',
  true
);

select throws_ok(
  $$select public.set_application_fee_bps(
       '00000000-0000-0000-0000-000000000001', 500)$$,
  '42501', null,
  'PF-20 a plain member may not set the fee rate'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000f1","role":"authenticated"}',
  true
);

select throws_ok(
  $$select public.set_application_fee_bps(
       (select id from public.tenants where slug = 'platform-test-fc'),
       10001)$$,
  '22023', null,
  'PF-21 a fee above 100% is refused'
);

select throws_ok(
  $$select public.set_application_fee_bps(
       (select id from public.tenants where slug = 'platform-test-fc'),
       -1)$$,
  '22023', null,
  'PF-22 a negative fee is refused'
);

reset role;

-- ── PF-23…PF-24 provisioning ────────────────────────────────────────────────
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000f2","role":"authenticated"}',
  true
);

select throws_ok(
  $$select public.provision_tenant('Rogue FC', 'rogue-fc')$$,
  '42501', null,
  'PF-23 a plain member may not provision a club'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000f1","role":"authenticated"}',
  true
);

select public.provision_tenant('Provisioned By Platform', 'provisioned-by-platform');
reset role;

select is(
  (select count(*) from public.tenants
    where slug = 'provisioned-by-platform'),
  1::bigint,
  'PF-24 a platform admin may provision a club'
);

-- ── PF-25…PF-28 the revoke ──────────────────────────────────────────────────
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select public.set_platform_admin('00000000-0000-0000-0000-0000000000f1', false);
reset role;

select is(
  (select count(*) from public.platform_admins
    where user_id = '00000000-0000-0000-0000-0000000000f1'),
  0::bigint,
  'PF-25 the revoke removes the membership row'
);

select is(
  (select raw_app_meta_data from auth.users
    where id = '00000000-0000-0000-0000-0000000000f1'),
  '{"role":"admin","tenant_id":"keep-me"}'::jsonb,
  'PF-26 the revoke removes only the platform claim'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000f1","role":"authenticated"}',
  true
);

select is(
  public.is_platform_admin(),
  false,
  'PF-27 a revoked user is no longer a platform admin'
);

set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

select throws_ok(
  $$select public.set_platform_admin(
       '00000000-0000-0000-0000-000000000099', true)$$,
  'P0002', null,
  'PF-28 granting to an unknown user raises'
);

reset role;

-- ── PF-29…PF-32 a tombstone is not a club (0052 × 0054) ─────────────────────
-- `erase_tenant` keeps the `tenants` row as the record that the club
-- existed. Nothing on this surface may treat it as operable: it is not
-- listed, not suspended, not re-priced, and its slug is retired.
insert into public.tenants (name, slug, erased_at)
values ('Erased FC', 'erased-fc', now());

set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

select is(
  (select count(*) from public.platform_tenants() where slug = 'erased-fc'),
  0::bigint,
  'PF-29 the registry excludes an erased club'
);

select throws_ok(
  $$select public.set_tenant_status(
       (select id from public.tenants where slug = 'erased-fc'), 'suspended')$$,
  '55000', null,
  'PF-30 an erased club cannot be suspended'
);

select throws_ok(
  $$select public.set_application_fee_bps(
       (select id from public.tenants where slug = 'erased-fc'), 100)$$,
  '55000', null,
  'PF-31 an erased club cannot be re-priced'
);

select throws_ok(
  $$select public.provision_tenant('Erased FC', 'erased-fc')$$,
  '55000', null,
  'PF-32 an erased club''s slug is retired'
);

reset role;

select * from finish();
rollback;
