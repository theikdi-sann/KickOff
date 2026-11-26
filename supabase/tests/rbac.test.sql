-- REQ-046 / NFR-10 — custom roles, capabilities and guards.
begin;
select plan(25);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000b1', 'rbac-admin@kickoff.test'),
  ('00000000-0000-0000-0000-0000000000b2', 'rbac-manager@kickoff.test'),
  ('00000000-0000-0000-0000-0000000000b3', 'rbac-fan@kickoff.test');

insert into public.staff_members (id, tenant_id, staff_role)
values ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-000000000001', 'admin');
-- RBAC-9: b2 starts as existing staff; a customer cannot be promoted later.
insert into public.staff_members (id, tenant_id, staff_role)
values ('00000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-000000000001', 'gatekeeper');

-- RBAC-2: seed counts.
select is(
  (select count(*) from public.staff_role_capabilities
    where tenant_id = '00000000-0000-0000-0000-000000000001' and role_code = 'admin'),
  10::bigint,
  'RBAC-2 admin seeds all ten capabilities'
);
select is(
  (select array_agg(capability) from public.staff_role_capabilities
    where tenant_id = '00000000-0000-0000-0000-000000000001' and role_code = 'gatekeeper'),
  array['operate_gate']::text[],
  'RBAC-2 gatekeeper seeds exactly operate_gate'
);

-- Act as the admin.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000b1', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated","app_metadata":{"role":"admin"}}',
  true
);

-- RBAC-1: create a custom role with a capability subset + audit row.
select lives_ok(
  $$select public.admin_create_role('match_manager', 'Match Manager', array['manage_matches','publish_news'])$$,
  'RBAC-1 an admin creates a custom role'
);
select is(
  (select array_agg(capability order by capability) from public.staff_role_capabilities
    where tenant_id = '00000000-0000-0000-0000-000000000001' and role_code = 'match_manager'),
  array['manage_matches','publish_news']::text[],
  'RBAC-1 the capability subset is stored'
);
select is(
  (select count(*) from public.audit_logs
    where action = 'rbac.role.create' and entity_id = 'match_manager'),
  1::bigint,
  'RBAC-1 role creation is audited'
);
select throws_ok(
  $$select public.admin_create_role('match_manager', 'Duplicate', array['manage_matches'])$$,
  '23505', null,
  'RBAC-1 duplicate role code is refused'
);
select throws_ok(
  $$select public.admin_create_role('admin', 'Reserved', array['manage_matches'])$$,
  '22023', null,
  'RBAC-1 reserved code is refused'
);
select throws_ok(
  $$select public.admin_create_role('bad_role', 'Bad', array['not_a_capability'])$$,
  '22023', null,
  'RBAC-1 unknown capability is refused'
);
select throws_ok(
  $$select public.admin_update_role('admin', 'Admin', array['manage_matches'])$$,
  '22023', null,
  'RBAC-2 built-in roles are immutable'
);

-- RBAC-3: assignment writes/removes the membership.
select lives_ok(
  $$select public.admin_assign_role('00000000-0000-0000-0000-0000000000b2', 'match_manager')$$,
  'RBAC-3 assignment writes the membership'
);
select is(
  (select staff_role from public.staff_members
    where id = '00000000-0000-0000-0000-0000000000b2'
      and tenant_id = '00000000-0000-0000-0000-000000000001'),
  'match_manager',
  'RBAC-3 the membership carries the custom role'
);

-- RBAC-6: the custom capability authorizes a match write; a fan is refused.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000b2', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000b2","role":"authenticated","app_metadata":{"role":"match_manager"}}',
  true
);
set local role authenticated;
select lives_ok(
  $$insert into public.matches (id, opponent, opponent_short, kickoff_at)
    values ('rbac-match', 'RBAC FC', 'RBC', now() + interval '3 days')$$,
  'RBAC-6 manage_matches can write a fixture'
);
reset role;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000b3', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000b3","role":"authenticated","app_metadata":{"role":"customer"}}',
  true
);
set local role authenticated;
select throws_ok(
  $$insert into public.matches (id, opponent, opponent_short, kickoff_at)
    values ('rbac-fan-match', 'Fan FC', 'FAN', now() + interval '3 days')$$,
  '42501', null,
  'RBAC-6 a fan cannot write a fixture'
);
reset role;

-- RBAC-4: no self-demotion / last-manager removal.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000b1', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated","app_metadata":{"role":"admin"}}',
  true
);
select throws_ok(
  $$select public.admin_assign_role('00000000-0000-0000-0000-0000000000b1', 'customer')$$,
  'P0001', null,
  'RBAC-4 self-demotion is refused'
);
select lives_ok(
  $$select public.admin_assign_role('00000000-0000-0000-0000-0000000000b2', 'match_manager')$$,
  'RBAC-3 reassigning an existing member is idempotent'
);

-- RBAC-5: another club's role is invisible and unwritable.
insert into public.tenants (id, name, slug)
values ('00000000-0000-0000-0000-0000000000c1', 'Other Club', 'other-club');
insert into public.staff_roles (tenant_id, code, name)
values ('00000000-0000-0000-0000-0000000000c1', 'other_role', 'Other Role');
select throws_ok(
  $$select public.admin_update_role('other_role', 'Hijack', array['manage_matches'])$$,
  'P0002', null,
  'RBAC-5 another club role cannot be updated'
);

-- RBAC-3: Customer removes the membership.
select lives_ok(
  $$select public.admin_assign_role('00000000-0000-0000-0000-0000000000b2', 'customer')$$,
  'RBAC-3 Customer removes the membership'
);
select is(
  (select count(*) from public.staff_members
    where id = '00000000-0000-0000-0000-0000000000b2'),
  0::bigint,
  'RBAC-3 no membership remains'
);

-- ── RBAC-9: staff accounts are created; customers are not promoted ──────────
-- Act as the admin again (RBAC-6 left the claims on the fan).
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000b1', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated","app_metadata":{"role":"admin"}}',
  true
);

select throws_ok(
  $$select public.admin_assign_role('00000000-0000-0000-0000-0000000000b3', 'gatekeeper')$$,
  'P0001', 'customer_not_staff',
  'RBAC-9 a customer cannot be promoted by a role update'
);
select is(
  (select count(*) from public.staff_members
    where id = '00000000-0000-0000-0000-0000000000b3'),
  0::bigint,
  'RBAC-9 the refused promotion wrote no membership'
);

select lives_ok(
  $$select public.admin_create_staff_member(
      '00000000-0000-0000-0000-0000000000b1',
      '00000000-0000-0000-0000-000000000001',
      '00000000-0000-0000-0000-0000000000b3',
      'gatekeeper')$$,
  'RBAC-9 an admin creates a staff account'
);
select is(
  (select staff_role from public.staff_members
    where id = '00000000-0000-0000-0000-0000000000b3'
      and tenant_id = '00000000-0000-0000-0000-000000000001'),
  'gatekeeper',
  'RBAC-9 the created account carries the requested role'
);
select is(
  (select count(*) from public.audit_logs
    where action = 'admin.user.create'
      and entity_id = '00000000-0000-0000-0000-0000000000b3'),
  1::bigint,
  'RBAC-9 staff creation is audited once'
);
select throws_ok(
  $$select public.admin_create_staff_member(
      '00000000-0000-0000-0000-0000000000b1',
      '00000000-0000-0000-0000-000000000001',
      '00000000-0000-0000-0000-0000000000b3',
      'customer')$$,
  '22023', null,
  'RBAC-9 customer is not a creatable role'
);
select throws_ok(
  $$select public.admin_create_staff_member(
      '00000000-0000-0000-0000-0000000000b1',
      '00000000-0000-0000-0000-000000000001',
      '00000000-0000-0000-0000-0000000000b3',
      'admin')$$,
  'P0001', null,
  'RBAC-9 an existing staff membership cannot be created twice'
);

select * from finish();
rollback;
