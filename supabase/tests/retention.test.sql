-- NFR-16 — the retention windows are executable and bounded.
--
-- Seeds one old and one fresh row per window, runs the daily sweep, and
-- asserts the old row is gone while the fresh one survives. The order cascade
-- is covered too: a 7-year-old order takes its ticket, seat line, refund and
-- scans with it.
begin;
select plan(14);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'retention@kickoff.test');

insert into public.matches (id, opponent, opponent_short, kickoff_at)
values ('m-retention', 'Retention FC', 'RET', now() + interval '30 days');

-- Financial records: 7 years.
insert into public.orders (id, user_id, match_id, amount_minor_units, status, created_at)
values
  ('ord-ret-old', '00000000-0000-0000-0000-0000000000a1', 'm-retention', 100, 'paid', now() - interval '8 years'),
  ('ord-ret-new', '00000000-0000-0000-0000-0000000000a1', 'm-retention', 100, 'paid', now());

insert into public.order_seats
  (id, order_id, seat_id, zone_name, row_label, number, price_minor_units, match_id)
values ('os-ret-old', 'ord-ret-old', 'm-bkk-north-A12', 'North Stand', 'A', 12, 100, 'm-retention');

insert into public.tickets
  (id, order_id, order_seat_id, user_id, match_id, seat_id, qr_nonce)
values
  ('tkt-ret-old', 'ord-ret-old', 'os-ret-old',
   '00000000-0000-0000-0000-0000000000a1', 'm-retention', 'm-bkk-north-A12', 'retention-nonce');

insert into public.refunds (id, order_id, tenant_id, amount_minor_units, currency)
values ('ref-ret-old', 'ord-ret-old', '00000000-0000-0000-0000-000000000001', 100, 'THB');

-- Scan history: 3 years.
insert into public.scan_events
  (id, ticket_id, raw_hash, result, gate_id, admin_id, idempotency_key, created_at)
values
  ('se-ret-old', 'tkt-ret-old', 'hash-old', 'valid', 'gate-1',
   '00000000-0000-0000-0000-0000000000a1', 'retention-key-old', now() - interval '4 years');

-- Stripe events: 90 days.
insert into public.stripe_events (id, type, created_at)
values
  ('evt-ret-old', 'checkout.session.completed', now() - interval '100 days'),
  ('evt-ret-new', 'checkout.session.completed', now() - interval '10 days');

-- Audit: 7 years.
insert into public.audit_logs (action, entity, created_at)
values
  ('retention.old', 'test', now() - interval '8 years'),
  ('retention.new', 'test', now());

-- Device tokens: 90 days unused.
insert into public.device_tokens (user_id, token, platform, last_seen_at)
values
  ('00000000-0000-0000-0000-0000000000a1', 'ExponentPushToken[old]', 'android', now() - interval '100 days'),
  ('00000000-0000-0000-0000-0000000000a1', 'ExponentPushToken[new]', 'android', now());

select ok(
  exists(select 1 from information_schema.columns
          where table_schema = 'public' and table_name = 'device_tokens' and column_name = 'last_seen_at'),
  'RET-1 device_tokens records last_seen_at'
);

select has_function(
  'public', 'prune_retention_windows', array[]::text[],
  'RET-2 the retention sweep function exists'
);

select public.prune_retention_windows();

select is(
  (select count(*) from public.orders where id = 'ord-ret-old'),
  0::bigint,
  'RET-3 the 7-year-old order is deleted'
);
select is(
  (select count(*) from public.orders where id = 'ord-ret-new'),
  1::bigint,
  'RET-4 the fresh order survives'
);
select is(
  (select count(*) from public.tickets where id = 'tkt-ret-old'),
  0::bigint,
  'RET-5 the old order cascades to its ticket'
);
select is(
  (select count(*) from public.order_seats where id = 'os-ret-old'),
  0::bigint,
  'RET-6 the old order cascades to its seat line'
);
select is(
  (select count(*) from public.refunds where id = 'ref-ret-old'),
  0::bigint,
  'RET-7 the old order cascades to its refund ledger row'
);
select is(
  (select count(*) from public.scan_events where id = 'se-ret-old'),
  0::bigint,
  'RET-8 the 3-year-old scan is deleted'
);
select is(
  (select count(*) from public.stripe_events where id = 'evt-ret-old'),
  0::bigint,
  'RET-9 the 90-day-old Stripe event is deleted'
);
select is(
  (select count(*) from public.stripe_events where id = 'evt-ret-new'),
  1::bigint,
  'RET-10 the fresh Stripe event survives'
);
select is(
  (select count(*) from public.audit_logs where action = 'retention.old'),
  0::bigint,
  'RET-11 the 7-year-old audit row is deleted'
);
select is(
  (select count(*) from public.audit_logs where action = 'retention.new'),
  1::bigint,
  'RET-12 the fresh audit row survives'
);
select is(
  (select count(*) from public.device_tokens where token = 'ExponentPushToken[old]'),
  0::bigint,
  'RET-13 the 90-day-idle token is deleted'
);
select is(
  (select count(*) from public.device_tokens where token = 'ExponentPushToken[new]'),
  1::bigint,
  'RET-14 the fresh token survives'
);

select * from finish();
rollback;
