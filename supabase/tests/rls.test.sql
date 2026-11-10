-- P11-01 — RLS on tickets and order seats: customer A cannot read customer B's
-- orders/tickets; the admin can. Orders/profiles are covered by rls-auth.test.sql.
begin;
select plan(7);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'carol@kickoff.test'),
  ('00000000-0000-0000-0000-0000000000a2', 'dave@kickoff.test'),
  ('00000000-0000-0000-0000-0000000000a3', 'root2@kickoff.test');

update public.profiles set role = 'admin' where id = '00000000-0000-0000-0000-0000000000a3';

insert into public.matches (id, opponent, opponent_short, kickoff_at)
values ('rls-match', 'RLS FC', 'RLS', now() + interval '10 days');

insert into public.zones (id, match_id, name, price_satang, rows, seats_per_row)
values ('rls-zone', 'rls-match', 'RLS Stand', 35000, array['A']::text[], 2);

insert into public.seats (id, zone_id, row_label, number) values
  ('rls-seat-carol', 'rls-zone', 'A', 1),
  ('rls-seat-dave', 'rls-zone', 'A', 2);

-- Carol's order + ticket, Dave's order + ticket.
insert into public.orders (id, user_id, match_id, amount_satang, status) values
  ('rls-order-carol', '00000000-0000-0000-0000-0000000000a1', 'rls-match', 35000, 'paid'),
  ('rls-order-dave', '00000000-0000-0000-0000-0000000000a2', 'rls-match', 35000, 'paid');

insert into public.order_seats (id, order_id, seat_id, zone_name, row_label, number, price_satang) values
  ('rls-os-carol', 'rls-order-carol', 'rls-seat-carol', 'RLS Stand', 'A', 1, 35000),
  ('rls-os-dave', 'rls-order-dave', 'rls-seat-dave', 'RLS Stand', 'A', 2, 35000);

insert into public.tickets (id, order_id, order_seat_id, user_id, match_id, seat_id, status) values
  ('rls-ticket-carol', 'rls-order-carol', 'rls-os-carol',
   '00000000-0000-0000-0000-0000000000a1', 'rls-match', 'rls-seat-carol', 'valid'),
  ('rls-ticket-dave', 'rls-order-dave', 'rls-os-dave',
   '00000000-0000-0000-0000-0000000000a2', 'rls-match', 'rls-seat-dave', 'valid');

-- Act as Carol.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated","app_metadata":{"role":"customer"}}',
  true
);
set local role authenticated;

select is(
  (select count(*) from public.tickets where match_id = 'rls-match'),
  1::bigint,
  'customer sees only their own ticket'
);

select is(
  (select count(*) from public.tickets where id = 'rls-ticket-dave'),
  0::bigint,
  'customer cannot read another customer''s ticket'
);

select is(
  (select count(*) from public.tickets where id = 'rls-ticket-carol'),
  1::bigint,
  'customer can read their own ticket'
);

select is(
  (select count(*) from public.order_seats os
     join public.orders o on o.id = os.order_id
    where o.match_id = 'rls-match'),
  1::bigint,
  'customer sees only their own order seats'
);

select is(
  (select count(*) from public.order_seats where id = 'rls-os-dave'),
  0::bigint,
  'customer cannot read another customer''s order seats'
);

reset role;

-- Act as the admin.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a3', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000a3","role":"authenticated","app_metadata":{"role":"admin"}}',
  true
);
set local role authenticated;

select is(
  (select count(*) from public.tickets where match_id = 'rls-match'),
  2::bigint,
  'admin sees every ticket'
);

select is(
  (select count(*) from public.order_seats os
     join public.orders o on o.id = os.order_id
    where o.match_id = 'rls-match'),
  2::bigint,
  'admin sees every order seat'
);

reset role;
select * from finish();
rollback;
