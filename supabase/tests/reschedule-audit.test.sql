-- RS (punch list #13) — the reschedule reason is storable by admins only.
-- 0037 grants authenticated-admin INSERT on audit_logs; rules themselves live
-- in shared Zod (no trigger, no RPC).
begin;
select plan(4);

-- 1. An admin can insert a reschedule audit row.
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000f1', 'rsadmin@kickoff.test');
-- The membership is the authority (0048): the legacy profile column is gone.
insert into public.staff_members (id, tenant_id, staff_role)
values ('00000000-0000-0000-0000-0000000000f1',
        '00000000-0000-0000-0000-000000000001', 'admin');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000f1', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000f1","role":"authenticated","app_metadata":{"role":"admin"}}',
  true
);
set local role authenticated;
select lives_ok(
  $$insert into public.audit_logs (actor_id, action, entity, entity_id, metadata)
    values ('00000000-0000-0000-0000-0000000000f1', 'reschedule', 'match', 'm-rs',
            '{"from":"2026-11-14T11:00:00.000Z","to":"2026-11-16T11:00:00.000Z","reason":"TV broadcast request"}'::jsonb)$$,
  'an admin can store a reschedule reason'
);

-- 2. The row reads back with its reason intact.
select is(
  (select metadata ->> 'reason' from public.audit_logs
   where action = 'reschedule' and entity_id = 'm-rs'),
  'TV broadcast request',
  'the reason survives the round trip'
);

-- 3. A non-admin authenticated user cannot.
reset role;
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000f2', 'rscustomer@kickoff.test');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000f2', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000f2","role":"authenticated","app_metadata":{"role":"customer"}}',
  true
);
set local role authenticated;
select throws_ok(
  $$insert into public.audit_logs (actor_id, action, entity, entity_id)
    values ('00000000-0000-0000-0000-0000000000f2', 'reschedule', 'match', 'm-rs2')$$,
  '42501',
  null,
  'a non-admin cannot write audit_logs'
);

-- 4. Anonymous cannot either.
reset role;
set local role anon;
select throws_ok(
  $$insert into public.audit_logs (action, entity, entity_id)
    values ('reschedule', 'match', 'm-rs3')$$,
  '42501',
  null,
  'anonymous cannot write audit_logs'
);

select * from finish();
rollback;
