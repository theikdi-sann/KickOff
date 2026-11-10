-- P3-33 — constraint and transition checks (pgTAP).
begin;
select plan(7);

select has_table('public', 'matches', 'matches table exists');
select col_type_is('public', 'zones', 'price_satang', 'integer', 'prices are integer satang');

-- Fixtures.
insert into auth.users (id, email)
values ('00000000-0000-0000-0000-0000000000aa', 'tap@kickoff.test');

-- Kick-off inside the ±2h scan window, otherwise the scan is rejected as
-- "the gates are not open yet".
insert into public.matches (id, opponent, opponent_short, kickoff_at)
values ('test-match', 'Test FC', 'TST', now() + interval '1 hour');

insert into public.zones (id, match_id, name, price_satang, rows, seats_per_row)
values ('test-zone', 'test-match', 'Test Stand', 35000, array['A']::text[], 2);

insert into public.seats (id, zone_id, row_label, number)
values ('test-seat', 'test-zone', 'A', 1);

-- The gate must be assigned to this fixture: scan_ticket derives wrong_match
-- from gates.match_id (F-4).
insert into public.gates (id, name, match_id, active)
values ('test-gate', 'Test Gate', 'test-match', true);

select throws_ok(
  $$ insert into public.seats (id, zone_id, row_label, number)
     values ('test-seat-dup', 'test-zone', 'A', 1) $$,
  '23505',
  null,
  'seat numbers are unique per zone/row'
);

select throws_ok(
  $$ insert into public.zones (id, match_id, name, price_satang, seats_per_row)
     values ('bad-zone', 'test-match', 'Bad Stand', -1, 1) $$,
  '23514',
  null,
  'negative prices are rejected'
);

insert into public.seat_holds (hold_group_id, seat_id, user_id, expires_at)
values ('g1', 'test-seat', '00000000-0000-0000-0000-0000000000aa', now() + interval '5 minutes');

select throws_ok(
  $$ insert into public.seat_holds (hold_group_id, seat_id, user_id, expires_at)
     values ('g2', 'test-seat', '00000000-0000-0000-0000-0000000000aa',
             now() + interval '5 minutes') $$,
  '23505',
  null,
  'a seat can have only one active hold'
);

-- Scan transition: valid → used.
insert into public.orders (id, user_id, match_id, amount_satang, status)
values ('test-order', '00000000-0000-0000-0000-0000000000aa', 'test-match', 35000, 'paid');

insert into public.order_seats (id, order_id, seat_id, zone_name, row_label, number, price_satang)
values ('test-os', 'test-order', 'test-seat', 'Test Stand', 'A', 1, 35000);

insert into public.tickets (id, order_id, order_seat_id, user_id, match_id, seat_id)
values ('test-ticket', 'test-order', 'test-os',
        '00000000-0000-0000-0000-0000000000aa', 'test-match', 'test-seat');

update public.order_seats set ticket_id = 'test-ticket' where id = 'test-os';

select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000aa","app_metadata":{"role":"admin"}}',
  true
);

-- 0027 made p_idempotency_key the 4th (required) argument; each call needs its
-- own key, otherwise the second call replays the first result.
select is(
  (public.scan_ticket('test-ticket', 'test-gate',
      '00000000-0000-0000-0000-0000000000aa', 'constraints-scan-1')::jsonb ->> 'code'),
  'valid',
  'first scan is accepted'
);

select is(
  (public.scan_ticket('test-ticket', 'test-gate',
      '00000000-0000-0000-0000-0000000000aa', 'constraints-scan-2')::jsonb ->> 'code'),
  'used',
  'second scan reports already used'
);

select * from finish();
rollback;
