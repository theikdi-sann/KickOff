-- Phase A — seat reservation lifecycle: a pending order reserves its seats
-- ('held') so a second buyer cannot double-sell while the first is on Stripe;
-- cancel/expiry frees them; mark_order_paid refuses conflicting seats.
begin;
select plan(16);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'buyer-a@kickoff.test'),
  ('00000000-0000-0000-0000-0000000000a2', 'buyer-b@kickoff.test')
on conflict (id) do nothing;

insert into public.matches (id, opponent, opponent_short, kickoff_at)
values ('rsv-match', 'Reservation FC', 'RSV', now() + interval '7 days')
on conflict do nothing;

insert into public.zones (id, match_id, name, price_satang, rows, seats_per_row)
values ('rsv-zone', 'rsv-match', 'R Stand', 35000, array['A']::text[], 2)
on conflict do nothing;

insert into public.seats (id, zone_id, row_label, number) values
  ('rsv-s1', 'rsv-zone', 'A', 1),
  ('rsv-s2', 'rsv-zone', 'A', 2)
on conflict do nothing;

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated","app_metadata":{"role":"customer"}}',
  true
);

-- A takes seat 1 to checkout.
select public.create_hold('rsv-match', array['rsv-s1']) as h1 \gset
select public.create_order_from_hold(:'h1'::jsonb ->> 'id') as o1 \gset

select isnt(:'o1'::jsonb ->> 'id', null::text, 'buyer A creates an order from the hold');

select is(
  (select status::text from public.seats where id = 'rsv-s1'),
  'held',
  'a pending order reserves the seat (held), not leaving it available'
);

select isnt(
  (select expires_at from public.orders where id = :'o1'::jsonb ->> 'id'),
  null::timestamptz,
  'the order records its expiry window for the Stripe session'
);

-- While A is on the Stripe page, B must not be able to touch the same seat.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a2', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000a2","role":"authenticated","app_metadata":{"role":"customer"}}',
  true
);

select throws_ok(
  $$ select public.create_hold('rsv-match', array['rsv-s1']) $$,
  '23505',
  null,
  'a second buyer cannot hold a seat that has a pending order'
);

-- A cancels the checkout: order cancelled, seat returned to sale.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated","app_metadata":{"role":"customer"}}',
  true
);

select public.cancel_order(:'o1'::jsonb ->> 'id', '00000000-0000-0000-0000-0000000000a1'::uuid) as c1 \gset
select is(:'c1'::jsonb ->> 'status', 'cancelled', 'the owner cancels the pending order');

select is(
  (select status::text from public.seats where id = 'rsv-s1'),
  'available',
  'cancelling the order releases its seat back to sale'
);

-- B can hold the freed seat now.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a2', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000a2","role":"authenticated","app_metadata":{"role":"customer"}}',
  true
);

select public.create_hold('rsv-match', array['rsv-s1']) as h2 \gset
select isnt(:'h2'::jsonb ->> 'id', null::text, 'after release a different buyer can hold the seat again');

-- B walks away from the seat so A can re-hold it below.
select public.release_hold(:'h2'::jsonb ->> 'id') as rel2 \gset

-- Non-owners cannot cancel someone else's order.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated","app_metadata":{"role":"customer"}}',
  true
);

select public.create_hold('rsv-match', array['rsv-s2']) as h3 \gset
select public.create_order_from_hold(:'h3'::jsonb ->> 'id') as o2 \gset
select isnt(:'o2'::jsonb ->> 'id', null::text, 'buyer A creates a second order on seat 2');

select format(
  'select public.cancel_order(%L, %L)',
  :'o2'::jsonb ->> 'id',
  '00000000-0000-0000-0000-0000000000a2'
) as sql_not_owner \gset
select throws_ok(
  :'sql_not_owner',
  '42501',
  null,
  'a different buyer cannot cancel someone else''s order'
);

-- Expiry frees the seats the order had reserved.
update public.orders
set expires_at = now() - interval '1 minute'
where id = :'o2'::jsonb ->> 'id';

select public.expire_pending_orders() as expired_count \gset

select is(
  (select status::text from public.orders where id = :'o2'::jsonb ->> 'id'),
  'cancelled',
  'an order past its expiry is cancelled'
);

select is(
  (select status::text from public.seats where id = 'rsv-s2'),
  'available',
  'expiry releases the reserved seat back to sale'
);

-- Payment marks the reserved seat sold and issues exactly one ticket.
select public.create_hold('rsv-match', array['rsv-s2']) as h4 \gset
select public.create_order_from_hold(:'h4'::jsonb ->> 'id') as o3 \gset
select isnt(:'o3'::jsonb ->> 'id', null::text, 'the freed seat can be checked out again');

select public.mark_order_paid(:'o3'::jsonb ->> 'id', 'sess-rsv-1', 'pi-rsv-1') as paid \gset

select is(
  (select status::text from public.seats where id = 'rsv-s2'),
  'sold',
  'mark_order_paid flips the reserved seat to sold'
);

select is(
  (select count(*) from public.tickets where order_id = :'o3'::jsonb ->> 'id'),
  1::bigint,
  'mark_order_paid issues exactly one ticket for the seat'
);

-- A seat that is no longer held (double-sell window) must fail the payment.
select public.create_hold('rsv-match', array['rsv-s1']) as h5 \gset
select public.create_order_from_hold(:'h5'::jsonb ->> 'id') as o4 \gset
update public.seats set status = 'available' where id = 'rsv-s1';

select format(
  'select public.mark_order_paid(%L, %L, %L)',
  :'o4'::jsonb ->> 'id',
  'sess-rsv-2',
  'pi-rsv-2'
) as sql_seat_conflict \gset
select throws_ok(
  :'sql_seat_conflict',
  'P0001',
  null,
  'payment on a seat that is no longer reserved is refused (late-pay refund path)'
);

-- A late webhook for a cancelled order raises P0001, which the webhook
-- converts into an automatic refund.
select format(
  'select public.mark_order_paid(%L, %L, %L)',
  :'o1'::jsonb ->> 'id',
  'sess-rsv-1',
  'pi-rsv-1'
) as sql_late_pay \gset
select throws_ok(
  :'sql_late_pay',
  'P0001',
  null,
  'payment against a cancelled order is refused'
);

select * from finish();
rollback;
