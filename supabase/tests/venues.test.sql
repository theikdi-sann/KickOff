-- VEN (punch list #12) — venues schema: FK, default, backfill, RLS.
begin;
select plan(8);

-- 1. Backfill left no match without a venue (venue_id NOT NULL + populated).
select is(
  (select count(*) from public.matches where venue_id is null),
  0::bigint,
  'every existing match resolves to a venue after the backfill'
);

-- 2. The home venue row the column default points at exists (migration 0035
--    inserts it — seed-independent, so a fresh CI database passes too).
select is(
  (select name from public.venues where id = 'v_kickoff'),
  'KickOff Arena',
  'the seeded home venue row exists for the column default'
);

-- 3. Bare insert (mvp-gate style) succeeds without naming a venue.
insert into public.matches (id, opponent, opponent_short, kickoff_at)
values ('ven-default-match', 'Default FC', 'DEF', now() + interval '10 days');
select is(
  (select venue_id from public.matches where id = 'ven-default-match'),
  'v_kickoff',
  'a match inserted without venue_id defaults to the home venue'
);

-- 4. The FK rejects an unknown venue.
select throws_ok(
  $$insert into public.matches (id, opponent, opponent_short, kickoff_at, venue_id)
    values ('ven-bogus', 'Bogus FC', 'BGS', now() + interval '10 days', 'v_missing')$$,
  '23503',
  null,
  'matches.venue_id rejects a venue that does not exist'
);

-- 5. Anon can read venues (catalogue).
insert into public.venues (id, name) values ('ven-rls', 'RLS Arena');
set local role anon;
select is(
  (select count(*) from public.venues where id = 'ven-rls'),
  1::bigint,
  'anonymous reads venues'
);

-- 6. Anon cannot write venues.
select throws_ok(
  $$insert into public.venues (id, name) values ('ven-anon', 'Anon Arena')$$,
  '42501',
  null,
  'anonymous cannot insert venues'
);

-- 7. An authenticated admin can write venues.
reset role;
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000e1', 'venadmin@kickoff.test');
update public.profiles set role = 'admin' where id = '00000000-0000-0000-0000-0000000000e1';
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000e1', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000e1","role":"authenticated","app_metadata":{"role":"admin"}}',
  true
);
set local role authenticated;
select lives_ok(
  $$insert into public.venues (id, name) values ('ven-admin', 'Admin Arena')$$,
  'an admin can insert venues'
);

-- 8. A non-admin authenticated user cannot.
reset role;
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000e2', 'vencustomer@kickoff.test');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000e2', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000e2","role":"authenticated","app_metadata":{"role":"customer"}}',
  true
);
set local role authenticated;
select throws_ok(
  $$insert into public.venues (id, name) values ('ven-cust', 'Customer Arena')$$,
  '42501',
  null,
  'a non-admin authenticated user cannot insert venues'
);

select * from finish();
rollback;
