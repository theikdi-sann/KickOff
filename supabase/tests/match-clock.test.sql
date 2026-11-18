-- MC — the match clock (status is intent, kickoff is truth).
--
-- 0056–0058 add two statuses, the audited status transition, and the
-- one-minute clock that closes a match at kickoff + 2h and rings the admin
-- bell. Scores are never automatic: a completed match without a result keeps
-- an unread "enter the result" notification and no fan result.
begin;
select plan(17);

-- 1–2. The enum carries the two new states.
select ok(
  exists (
    select 1 from pg_enum e
    join pg_type t on t.oid = e.enumtypid
    where t.typname = 'match_status' and e.enumlabel = 'postponed'
  ),
  'postponed is a real match status'
);
select ok(
  exists (
    select 1 from pg_enum e
    join pg_type t on t.oid = e.enumtypid
    where t.typname = 'match_status' and e.enumlabel = 'cancelled'
  ),
  'cancelled is a real match status'
);

-- The admin who performs the transitions.
insert into auth.users (id, email, raw_app_meta_data)
values ('00000000-0000-0000-0000-0000000000e1', 'clockadmin@kickoff.test',
        '{"role":"admin"}'::jsonb)
on conflict (id) do nothing;
insert into public.staff_members (id, tenant_id, staff_role)
values ('00000000-0000-0000-0000-0000000000e1',
        '00000000-0000-0000-0000-000000000001', 'admin')
on conflict (id, tenant_id) do update set staff_role = excluded.staff_role;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000e1', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000e1","role":"authenticated","app_metadata":{"role":"admin"}}',
  true
);

insert into public.matches (id, opponent, opponent_short, kickoff_at, status)
values
  ('mc-future', 'Future FC', 'FUT', now() + interval '3 hours', 'upcoming'),
  ('mc-past', 'Past FC', 'PST', now() - interval '3 hours', 'upcoming'),
  ('mc-postponed', 'Rain FC', 'RAN', now() - interval '3 hours', 'upcoming'),
  ('mc-cancelled', 'Gone FC', 'GON', now() - interval '3 hours', 'upcoming')
on conflict (id) do nothing;

-- 3. An admin may postpone with a reason.
set local role authenticated;
select lives_ok(
  $$select public.admin_set_match_status('mc-postponed', 'postponed', 'Waterlogged pitch')$$,
  'an admin can postpone a fixture with a reason'
);
select lives_ok(
  $$select public.admin_set_match_status('mc-cancelled', 'cancelled', 'Opponent withdrew')$$,
  'an admin can cancel a fixture with a reason'
);
reset role;

-- 4. The transition is audited.
select is(
  (select metadata ->> 'reason' from public.audit_logs
   where action = 'match_status' and entity_id = 'mc-postponed'
   order by created_at desc limit 1),
  'Waterlogged pitch',
  'the postponement reason is audited'
);

-- 5. A reason is mandatory.
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000e1","role":"authenticated","app_metadata":{"role":"admin"}}',
  true);
set local role authenticated;
select throws_ok(
  $$select public.admin_set_match_status('mc-future', 'cancelled', '   ')$$,
  'P0001',
  null,
  'cancelling without a reason is refused'
);

-- 6. The clock owns live and completed; the admin cannot fake them.
select throws_ok(
  $$select public.admin_set_match_status('mc-future', 'completed', 'trust me')$$,
  'P0001',
  null,
  'an admin cannot mark a match completed by hand'
);
reset role;

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000e1', true);

-- 7. One clock pass closes the past match and starts nothing early.
select public.record_match_clock(now());

select is(
  (select status::text from public.matches where id = 'mc-past'),
  'completed',
  'kickoff + 2h closes an upcoming match'
);
select is(
  (select status::text from public.matches where id = 'mc-future'),
  'upcoming',
  'a future match is untouched'
);

-- 8. Postponed and cancelled are never moved by the clock.
select is(
  (select string_agg(status::text, ',' order by id)
   from public.matches where id in ('mc-postponed', 'mc-cancelled')),
  'cancelled,postponed',
  'the clock ignores postponed and cancelled fixtures'
);

-- 9. The bell has a full-time entry for the match that just closed.
select ok(
  exists (
    select 1 from public.match_notifications
    where match_id = 'mc-past' and kind = 'full_time'
  ),
  'the clock rings the bell at full time'
);

-- 10. Every moment of the football clock is recorded exactly once.
select is(
  (select count(*)::int from public.match_notifications where match_id = 'mc-past'),
  4,
  'kickoff, half-time, near-end and full-time are each recorded once'
);

select public.record_match_clock(now());

-- 11. A second pass inserts no duplicates.
select is(
  (select count(*)::int from public.match_notifications where match_id = 'mc-past'),
  4,
  'the clock is idempotent'
);

-- 12. The result is never automatic.
select ok(
  (select home_score is null and away_score is null from public.matches where id = 'mc-past'),
  'a closed match still has no score until an admin enters it'
);

-- 13–14. The result is written by an admin, scores and status together.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000e1', true);
set local role authenticated;
select lives_ok(
  $$select public.admin_set_match_result('mc-past', 2, 1)$$,
  'an admin can enter the result'
);
reset role;
select is(
  (select status::text || ':' || home_score || '-' || away_score
   from public.matches where id = 'mc-past'),
  'completed:2-1',
  'one save writes the scores and closes the row'
);

-- 17. A future fixture cannot be closed with an early result.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000e1', true);
set local role authenticated;
select throws_ok(
  $$select public.admin_set_match_result('mc-future', 1, 0)$$,
  'P0001',
  null,
  'a match that has not kicked off cannot take a result'
);
reset role;

select * from finish();
rollback;
