-- P5-19 — RLS: customers only see their own data; admins see everything.
begin;
select plan(5);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000b1', 'alice@xclub.test'),
  ('00000000-0000-0000-0000-0000000000b2', 'bob@xclub.test'),
  ('00000000-0000-0000-0000-0000000000b3', 'root@xclub.test');

update public.profiles set role = 'admin' where id = '00000000-0000-0000-0000-0000000000b3';

insert into public.matches (id, opponent, opponent_short, kickoff_at)
values ('tap-match', 'Tap FC', 'TAP', now() + interval '10 days');

insert into public.orders (id, user_id, match_id, amount_satang, status) values
  ('tap-order-alice', '00000000-0000-0000-0000-0000000000b1', 'tap-match', 35000, 'paid'),
  ('tap-order-bob', '00000000-0000-0000-0000-0000000000b2', 'tap-match', 45000, 'paid');

-- Act as Alice.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000b1', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated","app_metadata":{"role":"customer"}}',
  true
);
set local role authenticated;

select is(
  (select count(*) from public.profiles),
  1::bigint,
  'customer sees only their own profile'
);

select is(
  (select count(*) from public.orders),
  1::bigint,
  'customer sees only their own order'
);

select is(
  (select count(*) from public.orders where id = 'tap-order-bob'),
  0::bigint,
  'customer cannot read another order'
);

reset role;

-- Act as the admin.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000b3', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000b3","role":"authenticated","app_metadata":{"role":"admin"}}',
  true
);
set local role authenticated;

select is(
  (select count(*) from public.profiles),
  3::bigint,
  'admin sees every profile'
);

select is(
  (select count(*) from public.orders where id in ('tap-order-alice', 'tap-order-bob')),
  2::bigint,
  'admin sees every order'
);

reset role;
select * from finish();
rollback;
