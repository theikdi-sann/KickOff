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
select plan(21);

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

-- ── the dual-write bridge ───────────────────────────────────────────────────
update public.profiles set role = 'admin'
where id = '00000000-0000-0000-0000-0000000000d1';

select is(
  (select staff_role from public.staff_members
    where id = '00000000-0000-0000-0000-0000000000d1'
      and tenant_id = '00000000-0000-0000-0000-000000000001'),
  'admin',
  'promoting a profile creates its staff membership'
);

update public.profiles set role = 'gatekeeper'
where id = '00000000-0000-0000-0000-0000000000d2';

update public.profiles set role = 'admin'
where id = '00000000-0000-0000-0000-0000000000d2';

select is(
  (select staff_role from public.staff_members
    where id = '00000000-0000-0000-0000-0000000000d2'
      and tenant_id = '00000000-0000-0000-0000-000000000001'),
  'admin',
  'a role change updates the existing membership'
);

update public.profiles set role = 'customer'
where id = '00000000-0000-0000-0000-0000000000d1';

select is(
  (select count(*) from public.staff_members
    where id = '00000000-0000-0000-0000-0000000000d1'),
  0::bigint,
  'demoting a profile removes its staff membership'
);

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
select * from finish();
rollback;
