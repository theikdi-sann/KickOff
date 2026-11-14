-- P11-02 — order expiry: a stale pending order is cancelled and its seats
-- return to availability; a paid order is never expired and stays sold.
begin;
select plan(7);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000e1', 'expiry@kickoff.test');

insert into public.matches (id, opponent, opponent_short, kickoff_at)
values ('exp-match', 'Expiry FC', 'EXP', now() + interval '10 days');

insert into public.zones (id, match_id, name, rows, seats_per_row)
values ('exp-zone', 'exp-match', 'Expiry Stand', array['A']::text[], 2);

insert into public.match_zone_prices (match_id, zone_id, price_minor_units)
values ('exp-match', 'exp-zone', 35000);

insert into public.seats (id, zone_id, row_label, number) values
  ('exp-seat-pending', 'exp-zone', 'A', 1),
  ('exp-seat-paid', 'exp-zone', 'A', 2);

-- expire_pending_orders() is global: clear any stale pending order already in
-- the database so the count asserted below only reflects this fixture.
-- (Inside the transaction, so nothing actually changes.)
select public.expire_pending_orders()::bigint;

-- A pending order for seat 1 and a paid order for seat 2.
insert into public.orders (id, user_id, match_id, amount_minor_units, status, created_at) values
  ('exp-order-pending', '00000000-0000-0000-0000-0000000000e1', 'exp-match', 35000,
   'pending', now() - interval '20 minutes'),
  ('exp-order-paid', '00000000-0000-0000-0000-0000000000e1', 'exp-match', 35000,
   'paid', now() - interval '20 minutes');

insert into public.order_seats (id, order_id, seat_id, match_id, zone_name, row_label, number, price_minor_units) values
  ('exp-os-pending', 'exp-order-pending', 'exp-seat-pending', 'exp-match', 'Expiry Stand', 'A', 1, 35000),
  ('exp-os-paid', 'exp-order-paid', 'exp-seat-paid', 'exp-match', 'Expiry Stand', 'A', 2, 35000);

-- The paid seat is withheld by its paid order; the pending seat is withheld
-- by the pending-order rule. Neither needs a flag on the seat row.
select is(
  (select available_seats from public.zone_availability where zone_id = 'exp-zone'),
  0::bigint,
  'both seats are withheld: one pending order, one sold'
);

-- Only the stale pending order is eligible: the paid one is older too, but is
-- not pending, so it must be left alone.
select is(
  public.expire_pending_orders()::bigint,
  1::bigint,
  'exactly one stale pending order is expired'
);

select is(
  (select status::text from public.orders where id = 'exp-order-pending'),
  'cancelled',
  'the stale pending order is cancelled'
);

select is(
  (select status::text from public.orders where id = 'exp-order-paid'),
  'paid',
  'the paid order is not expired'
);

select is(
  (select available_seats from public.zone_availability where zone_id = 'exp-zone'),
  1::bigint,
  'the cancelled order releases its seat back to sale'
);

select is(
  (select count(*) from public.order_seats os
     join public.orders o on o.id = os.order_id
    where os.seat_id = 'exp-seat-paid' and o.status in ('pending', 'paid')),
  1::bigint,
  'the paid seat stays taken'
);

-- A fresh pending order (inside the 15-minute window) must not be expired.
insert into public.orders (id, user_id, match_id, amount_minor_units, status, created_at) values
  ('exp-order-fresh', '00000000-0000-0000-0000-0000000000e1', 'exp-match', 35000,
   'pending', now() - interval '2 minutes');

select is(
  public.expire_pending_orders()::bigint,
  0::bigint,
  'a pending order inside the window is not expired'
);

select * from finish();
rollback;
