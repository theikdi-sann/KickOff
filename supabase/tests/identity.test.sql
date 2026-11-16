-- 0041 — the identity split (C6.2).
--
-- The suite proves the account model ADR-001 describes:
--   * `fans`, `staff_roles` and `staff_members` exist;
--   * every tenant gets the `admin` / `gatekeeper` role rows, and
--     `provision_tenant()` seeds them idempotently;
--   * a legacy `profiles.role` change is mirrored into `staff_members`
--     (the dual-write bridge that keeps the old column live until 0048);
--   * a membership is unique per (profile, tenant) and must reference a role
--     that exists for that tenant;
--   * members read only their own fan/staff rows, admins read the club's, and
--     nobody writes the identity tables directly.
begin;
select plan(28);

-- ── structure ───────────────────────────────────────────────────────────────
select has_table('public', 'fans', 'fans table exists');
select has_table('public', 'staff_roles', 'staff_roles table exists');
select has_table('public', 'staff_members', 'staff_members table exists');

-- ── the seeded role vocabulary ──────────────────────────────────────────────
select is(
  (select count(*) from public.staff_roles
    where tenant_id = '00000000-0000-0000-0000-000000000001'),
  2::bigint,
  'the default club has exactly the two staff roles'
);

select is(
  (select can_manage_staff and can_operate_gate from public.staff_roles
    where tenant_id = '00000000-0000-0000-0000-000000000001' and code = 'admin'),
  true,
  'admin may manage staff and operate the gate'
);

select is(
  (select (not can_manage_staff) and can_operate_gate from public.staff_roles
    where tenant_id = '00000000-0000-0000-0000-000000000001' and code = 'gatekeeper'),
  true,
  'gatekeeper may operate the gate but not manage staff'
);

-- ── provisioning seeds the vocabulary ───────────────────────────────────────
select is(
  public.provision_tenant('Identity FC', 'identity-fc'),
  public.provision_tenant('Identity FC', 'identity-fc'),
  'provision_tenant is still idempotent by slug'
);

select is(
  (select count(*) from public.staff_roles sr
     join public.tenants t on t.id = sr.tenant_id
    where t.slug = 'identity-fc'),
  2::bigint,
  'a new club is provisioned with its two staff roles'
);

-- ── fixtures ────────────────────────────────────────────────────────────────
-- scan-concurrency commits its fixtures before its workers run; a run that
-- dies before its cleanup leaves `d2` behind, so tolerate a pre-existing row.
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000d1', 'staff@kickoff.test'),
  ('00000000-0000-0000-0000-0000000000d2', 'gate@kickoff.test'),
  ('00000000-0000-0000-0000-0000000000d3', 'fan@kickoff.test'),
  ('00000000-0000-0000-0000-0000000000d4', 'root@kickoff.test')
on conflict (id) do nothing;

-- ── the membership is the authority ─────────────────────────────────────────
-- 0048 drops the legacy `profiles.role` column with its dual-write bridge:
-- a membership is written directly now, and it is what the database reads.
insert into public.staff_members (id, tenant_id, staff_role)
values ('00000000-0000-0000-0000-0000000000d1',
        '00000000-0000-0000-0000-000000000001', 'admin'),
       ('00000000-0000-0000-0000-0000000000d2',
        '00000000-0000-0000-0000-000000000001', 'admin');

select is(
  (select staff_role from public.staff_members
    where id = '00000000-0000-0000-0000-0000000000d1'
      and tenant_id = '00000000-0000-0000-0000-000000000001'),
  'admin',
  'a membership is written directly — no profile column is involved'
);

select is(
  (select count(*) from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles'
      and column_name = 'role'),
  0::bigint,
  'the legacy profiles.role column is gone'
);

select is(
  (select count(*) from pg_trigger
    where tgrelid = 'public.profiles'::regclass
      and tgname in ('profiles_sync_staff_member', 'profiles_prevent_role_escalation')),
  0::bigint,
  'the dual-write bridge and the role guard are gone'
);

select is(
  (select count(*) from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('sync_staff_member', 'prevent_role_escalation')),
  0::bigint,
  'the bridge functions are gone'
);

-- The membership grants the authority…
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000d1","role":"authenticated","app_metadata":{"role":"admin"}}',
  true
);
select is(public.is_admin(), true, 'the membership makes an admin');

-- …and removing it takes the authority away again.
delete from public.staff_members
  where id = '00000000-0000-0000-0000-0000000000d1';

select is(public.is_admin(), false, 'removing the membership removes the authority');

-- ── integrity ───────────────────────────────────────────────────────────────
select throws_ok(
  $$ insert into public.staff_members (id, tenant_id, staff_role)
     values ('00000000-0000-0000-0000-0000000000d3',
             '00000000-0000-0000-0000-000000000001', 'owner') $$,
  '23503',
  null,
  'a membership must reference a role that exists for its club'
);

select throws_ok(
  $$ insert into public.staff_members (id, tenant_id, staff_role)
     values ('00000000-0000-0000-0000-0000000000d2',
             '00000000-0000-0000-0000-000000000001', 'admin') $$,
  '23505',
  null,
  'a profile has at most one membership per club'
);

-- ── RLS: fans ───────────────────────────────────────────────────────────────
insert into public.fans (id) values ('00000000-0000-0000-0000-0000000000d3');

select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000d3","role":"authenticated","app_metadata":{"role":"customer"}}',
  true
);
set local role authenticated;

select is(
  (select count(*) from public.fans),
  1::bigint,
  'a fan reads their own row'
);

select is(
  (select count(*) from public.fans
    where id = '00000000-0000-0000-0000-0000000000d2'),
  0::bigint,
  'a fan cannot read another person''s row'
);

reset role;

-- ── RLS: staff ──────────────────────────────────────────────────────────────
-- d2 is an admin; d3 is a plain customer.
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000d2","role":"authenticated","app_metadata":{"role":"admin"}}',
  true
);
set local role authenticated;

select is(
  (select count(*) from public.staff_members
    where tenant_id = '00000000-0000-0000-0000-000000000001'),
  1::bigint,
  'an admin reads the club''s memberships'
);

select is(
  (select count(*) from public.staff_roles
    where tenant_id = '00000000-0000-0000-0000-000000000001'),
  2::bigint,
  'a member reads the role vocabulary'
);

select throws_ok(
  $$ insert into public.staff_roles (tenant_id, code, name)
     values ('00000000-0000-0000-0000-000000000001', 'owner', 'Owner') $$,
  '42501',
  null,
  'a member cannot create a role'
);

select throws_ok(
  $$ insert into public.staff_members (id, tenant_id, staff_role)
     values ('00000000-0000-0000-0000-0000000000d2',
             '00000000-0000-0000-0000-000000000001', 'gatekeeper') $$,
  '42501',
  null,
  'a member cannot grant a membership'
);

reset role;

-- A non-admin staff member reads only their own membership.
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000d2","role":"authenticated","app_metadata":{"role":"gatekeeper"}}',
  true
);
set local role authenticated;

select is(
  (select count(*) from public.staff_members),
  1::bigint,
  'a gatekeeper reads only their own membership'
);

select is(
  (select count(*) from public.staff_members
    where id = '00000000-0000-0000-0000-0000000000d1'),
  0::bigint,
  'a gatekeeper cannot read another person''s membership'
);

reset role;

-- ── the service-role promotion helper ───────────────────────────────────────
-- 0047 moved the promotion off the legacy `profiles.role` column: it grants
-- the membership the *database* authorises on and merges the JWT claim the
-- *Edge guards* read, so a promotion can no longer half-apply.
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

select lives_ok(
  $$select public.grant_admin('root@kickoff.test')$$,
  'the promotion helper runs for the service role'
);

reset role;

select is(
  (select staff_role from public.staff_members
    where id = '00000000-0000-0000-0000-0000000000d4'
      and tenant_id = '00000000-0000-0000-0000-000000000001'),
  'admin',
  'the promotion granted the membership the database reads'
);

select is(
  (select raw_app_meta_data ->> 'role' from auth.users
    where id = '00000000-0000-0000-0000-0000000000d4'),
  'admin',
  'the promotion merged the JWT claim the Edge guards read'
);

select is(
  (select count(*) from public.profiles
    where id = '00000000-0000-0000-0000-0000000000d4'),
  1::bigint,
  'the promotion writes no profile row — only the membership and the claim'
);

select * from finish();
rollback;
