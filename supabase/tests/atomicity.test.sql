-- F-07 — atomicity: a reschedule and its audit row are one transaction, and
-- the database half of a refund (order, tickets, seats, audit) is one
-- transaction. The Stripe refund happens outside the database and is made
-- safe by an order-scoped idempotency key; this suite proves the database
-- side can never be left half-written.
begin;
select plan(30);

-- With no seat status column, "taken" is derived rather than stored: an active
-- hold or a live order line claims the seat. Same rule `create_hold` applies.
create function pg_temp.seat_taken(p_seat_id text)
returns boolean
language sql
stable
as $$
  select
    exists (
      select 1 from public.seat_holds h
      where h.seat_id = p_seat_id
        and h.released_at is null
        and h.expires_at > now()
    )
    or exists (
      select 1
      from public.order_seats os
      join public.orders o on o.id = os.order_id
      where os.seat_id = p_seat_id
        and o.status in ('pending', 'paid')
    );
$$;

-- ── fixtures ────────────────────────────────────────────────────────────────
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'atomic.admin@kickoff.test'),
  ('00000000-0000-0000-0000-0000000000a2', 'atomic.fan@kickoff.test');
update public.profiles set role = 'admin'
  where id = '00000000-0000-0000-0000-0000000000a1';

insert into public.matches (id, opponent, opponent_short, kickoff_at)
values ('atm-match', 'Original FC', 'ORI', '2026-11-20T18:00:00+07:00');

insert into public.zones (id, match_id, name, rows, seats_per_row)
values ('atm-zone', 'atm-match', 'Atomic Stand', array['A']::text[], 2);

insert into public.match_zone_prices (match_id, zone_id, price_minor_units)
values ('atm-match', 'atm-zone', 35000);

insert into public.seats (id, zone_id, row_label, number) values
  ('atm-seat-1', 'atm-zone', 'A', 1),
  ('atm-seat-2', 'atm-zone', 'A', 2);

insert into public.orders (id, user_id, match_id, amount_minor_units, status, payment_intent_id) values
  ('atm-order',   '00000000-0000-0000-0000-0000000000a2', 'atm-match', 35000, 'paid', 'pi_atm_one'),
  ('atm-order-2', '00000000-0000-0000-0000-0000000000a2', 'atm-match', 35000, 'paid', 'pi_atm_two');

insert into public.order_seats (id, order_id, seat_id, match_id, zone_name, row_label, number, price_minor_units) values
  ('atm-os-1', 'atm-order',   'atm-seat-1', 'atm-match', 'Atomic Stand', 'A', 1, 35000),
  ('atm-os-2', 'atm-order-2', 'atm-seat-2', 'atm-match', 'Atomic Stand', 'A', 2, 35000);

insert into public.tickets (id, order_id, order_seat_id, user_id, match_id, seat_id, status) values
  ('atm-ticket-1', 'atm-order',   'atm-os-1',
   '00000000-0000-0000-0000-0000000000a2', 'atm-match', 'atm-seat-1', 'valid'),
  ('atm-ticket-2', 'atm-order-2', 'atm-os-2',
   '00000000-0000-0000-0000-0000000000a2', 'atm-match', 'atm-seat-2', 'used');

-- audit_logs.actor_id → auth.users can no longer fail for an admin: 0041
-- made a membership imply an auth.users row, and is_admin() needs a
-- membership. The suite injects the same SQLSTATE the FK would raise for
-- this one reason, so F07-4/F07-5 still pin the reschedule and its audit
-- row to a single transaction.
create function pg_temp.refuse_no_actor_audit()
returns trigger
language plpgsql
as $$
begin
  raise exception 'audit_logs.actor_id references auth.users(id)'
    using errcode = '23503';
end;
$$;

create trigger audit_refuses_no_actor
before insert on public.audit_logs
for each row
when (new.metadata ->> 'reason' = 'No actor')
execute function pg_temp.refuse_no_actor_audit();

-- ── reschedule: one call, one transaction ───────────────────────────────────
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated","app_metadata":{"role":"admin"}}',
  true
);
set local role authenticated;

-- 1. A kickoff move without a reason is refused before anything is written.
select throws_ok(
  $$select public.admin_update_match('atm-match', '{"kickoff_at":"2026-11-25T19:30:00+07:00"}', null)$$,
  'P0001', null,
  'F07-1 a kickoff move without a reason is refused'
);

-- 2. The fixture is untouched by the refused call.
select is(
  (select kickoff_at from public.matches where id = 'atm-match'),
  '2026-11-20T18:00:00+07:00'::timestamptz,
  'F07-2 the refused reschedule left the kickoff untouched'
);

-- 3. The patch may only touch allowlisted columns.
select throws_ok(
  $$select public.admin_update_match('atm-match', '{"evil":"x"}', null)$$,
  '22023', null,
  'F07-3 the patch may only touch allowlisted columns'
);

-- 4. If the audit row cannot be written, the kickoff move goes with it.
-- The fixture trigger refuses this exact reason with the SQLSTATE the
-- audit FK would raise (see the fixtures above).
select throws_ok(
  $$select public.admin_update_match('atm-match', '{"kickoff_at":"2026-11-25T19:30:00+07:00"}', 'No actor')$$,
  '23503', null,
  'F07-4 a reschedule whose audit row cannot be written fails outright'
);

-- 5. …and the kickoff did not move.
select is(
  (select kickoff_at from public.matches where id = 'atm-match'),
  '2026-11-20T18:00:00+07:00'::timestamptz,
  'F07-5 the failed audit write rolled the kickoff back'
);

-- The injected audit failure has served its purpose; F07-6 writes a real row.
reset role;
drop trigger audit_refuses_no_actor on public.audit_logs;
set local role authenticated;

-- 6. One call moves the fixture and reports the venue name back.
select ok(
  (select length(public.admin_update_match(
    'atm-match',
    '{"kickoff_at":"2026-11-25T19:30:00+07:00","opponent":"Atomic FC"}',
    'TV broadcast rights'
  ) ->> 'venue_name') > 0),
  'F07-6 the call returns the updated fixture with its venue name'
);

select is(
  (select kickoff_at from public.matches where id = 'atm-match'),
  '2026-11-25T19:30:00+07:00'::timestamptz,
  'F07-7 the kickoff moved'
);
select is(
  (select opponent from public.matches where id = 'atm-match'),
  'Atomic FC',
  'F07-8 the rest of the patch applied'
);
select is(
  (select count(*) from public.audit_logs
    where action = 'reschedule' and entity_id = 'atm-match'
      and (metadata ->> 'from')::timestamptz = '2026-11-20T18:00:00+07:00'::timestamptz
      and (metadata ->> 'to')::timestamptz = '2026-11-25T19:30:00+07:00'::timestamptz
      and metadata ->> 'reason' = 'TV broadcast rights'),
  1::bigint,
  'F07-9 exactly one reschedule audit row carries from, to and reason'
);

-- 10. A non-admin cannot reschedule.
reset role;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a2', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000a2","role":"authenticated","app_metadata":{"role":"customer"}}',
  true
);
set local role authenticated;
select throws_ok(
  $$select public.admin_update_match('atm-match', '{"opponent":"Nope FC"}', null)$$,
  '42501', null,
  'F07-10 a non-admin cannot move a fixture'
);

-- 11. The refund state change is not reachable from a user session.
select throws_ok(
  $$select public.mark_order_refunded('atm-order','00000000-0000-0000-0000-0000000000a1','re_x',null,false)$$,
  '42501', null,
  'F07-11 the refund state change is reserved for the service role'
);

-- ── refund: one call, one transaction ───────────────────────────────────────
reset role;

-- 12. An unwriteable audit row fails the whole refund.
select throws_ok(
  $$select public.mark_order_refunded('atm-order','00000000-0000-0000-0000-0000000000ff','re_bad',null,false)$$,
  '23503', null,
  'F07-12 a refund whose audit row cannot be written fails outright'
);
-- 13–16. …leaving no half-written state behind.
select is(
  (select status::text from public.orders where id = 'atm-order'),
  'paid',
  'F07-13 the order is still paid after the failed refund'
);
select is(
  (select status::text from public.tickets where id = 'atm-ticket-1'),
  'valid',
  'F07-14 the ticket is still valid'
);
select is(
  pg_temp.seat_taken('atm-seat-1'),
  true,
  'F07-15 the seat is still taken'
);
select is(
  (select count(*) from public.audit_logs
    where action = 'order.refund' and entity_id = 'atm-order'),
  0::bigint,
  'F07-16 no refund audit row was left behind'
);

-- 17. Used tickets require the explicit override, checked in the same call.
select throws_ok(
  $$select public.mark_order_refunded('atm-order-2','00000000-0000-0000-0000-0000000000a1','re_used',null,false)$$,
  'P0001', null,
  'F07-17 refunding used tickets requires the override'
);
select is(
  (select status::text from public.orders where id = 'atm-order-2'),
  'paid',
  'F07-18 the guarded order is untouched'
);

-- 19–23. The service role runs the real refund.
set local role service_role;
select is(
  (select public.mark_order_refunded(
    'atm-order', '00000000-0000-0000-0000-0000000000a1', 're_atm_one',
    'requested by the operator', false
  ) ->> 'alreadyRefunded'),
  'false',
  'F07-19 the refund state change reports a fresh refund'
);
reset role;
select is(
  (select status::text from public.orders where id = 'atm-order'),
  'refunded',
  'F07-20 the order is refunded'
);
select is(
  (select status::text from public.tickets where id = 'atm-ticket-1'),
  'void',
  'F07-21 the ticket is voided'
);
select is(
  pg_temp.seat_taken('atm-seat-1'),
  false,
  'F07-22 the seat returns to sale'
);
select is(
  (select count(*) from public.audit_logs
    where action = 'order.refund' and entity_id = 'atm-order'
      and metadata ->> 'refund_id' = 're_atm_one'
      and metadata ->> 'used_tickets' = '0'),
  1::bigint,
  'F07-23 the refund is audited with its Stripe id and used-ticket count'
);

-- 24–25. A replay is a no-op, not a second refund.
set local role service_role;
select is(
  (select public.mark_order_refunded(
    'atm-order', '00000000-0000-0000-0000-0000000000a1', 're_atm_one', null, false
  ) ->> 'alreadyRefunded'),
  'true',
  'F07-24 a replayed refund is a no-op'
);
reset role;
select is(
  (select count(*) from public.audit_logs
    where action = 'order.refund' and entity_id = 'atm-order'),
  1::bigint,
  'F07-25 the replay wrote no second audit row'
);

-- 26–30. The override path voids tickets but keeps their seats sold.
set local role service_role;
select is(
  (select public.mark_order_refunded(
    'atm-order-2', '00000000-0000-0000-0000-0000000000a1', 're_atm_two', null, true
  ) ->> 'alreadyRefunded'),
  'false',
  'F07-26 used tickets can be refunded with the override'
);
reset role;
select is(
  (select status::text from public.orders where id = 'atm-order-2'),
  'refunded',
  'F07-27 the overridden order is refunded'
);
select is(
  (select status::text from public.tickets where id = 'atm-ticket-2'),
  'void',
  'F07-28 its ticket is voided'
);
select is(
  pg_temp.seat_taken('atm-seat-2'),
  false,
  'F07-29 the override allows the refund, so the seat returns to sale too'
);
select is(
  (select count(*) from public.audit_logs
    where action = 'order.refund' and entity_id = 'atm-order-2'
      and metadata ->> 'override_used_tickets' = 'true'),
  1::bigint,
  'F07-30 the overridden refund is audited as an override'
);

select * from finish();
rollback;
