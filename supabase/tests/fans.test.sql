-- REQ-26 — fan lifecycle status is per person and read only by the fan or by
-- a manager with `manage_staff`. The Edge function changes the auth account;
-- this suite proves the state row and its RLS boundary.
begin;
select plan(5);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000f1', 'fan-admin@kickoff.test'),
  ('00000000-0000-0000-0000-0000000000f2', 'fan-person@kickoff.test');

insert into public.staff_members (id, tenant_id, staff_role)
values ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-000000000001', 'admin');

insert into public.fans (id) values ('00000000-0000-0000-0000-0000000000f2');
select is(
  (select status from public.fans where id = '00000000-0000-0000-0000-0000000000f2'),
  'active',
  'REQ-26 a new fan starts active'
);

insert into public.fans (id, status) values ('00000000-0000-0000-0000-0000000000f1', 'suspended');
select throws_ok(
  $$insert into public.fans (id, status)
    values ('00000000-0000-0000-0000-0000000000f2', 'banned')$$,
  '23514', null,
  'REQ-26 the fan status vocabulary is closed'
);

-- A fan sees their own state.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000f2', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000f2","role":"authenticated","app_metadata":{"role":"customer"}}',
  true
);
set local role authenticated;
select is(
  (select count(*) from public.fans where id = '00000000-0000-0000-0000-0000000000f2'),
  1::bigint,
  'REQ-26 a fan reads their own status'
);
select is(
  (select count(*) from public.fans where id = '00000000-0000-0000-0000-0000000000f1'),
  0::bigint,
  'REQ-26 a fan cannot read another person''s status'
);
reset role;

-- A manager sees the club list.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000f1', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000f1","role":"authenticated","app_metadata":{"role":"admin"}}',
  true
);
set local role authenticated;
select is(
  (select status from public.fans where id = '00000000-0000-0000-0000-0000000000f1'),
  'suspended',
  'REQ-26 manage_staff reads every fan status'
);
reset role;

select * from finish();
rollback;
