-- Phase 1 — seating is physical but the sale window is not: once a fixture has
-- kicked off, its zone layout, prices and seats are history. The console must
-- not be able to add or edit inventory for a match nobody can buy into.
begin;
select plan(6);

insert into auth.users (id, email, raw_app_meta_data)
values ('00000000-0000-0000-0000-0000000000f5', 'seatinglock@kickoff.test',
        '{"role":"admin"}'::jsonb)
on conflict (id) do nothing;
insert into public.staff_members (id, tenant_id, staff_role)
values ('00000000-0000-0000-0000-0000000000f5',
        '00000000-0000-0000-0000-000000000001', 'admin')
on conflict (id, tenant_id) do update set staff_role = excluded.staff_role;

-- Three fixtures: one in the past, one in play, one still ahead.
insert into public.matches (id, opponent, opponent_short, kickoff_at, status)
values
  ('sl-past', 'Past FC', 'PST', now() - interval '3 hours', 'completed'),
  ('sl-live', 'Live FC', 'LIV', now() - interval '10 minutes', 'live'),
  ('sl-future', 'Future FC', 'FUT', now() + interval '3 hours', 'upcoming')
on conflict (id) do nothing;

-- A zone on the past fixture, written by the trusted setup path, so the seat
-- trigger has a parent to resolve.
insert into public.zones (id, match_id, name, rows, seats_per_row)
values ('sl-past-zone', 'sl-past', 'Past Stand', array['A']::text[], 2)
on conflict (id) do nothing;

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000f5', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000f5","role":"authenticated","app_metadata":{"role":"admin"}}',
  true
);
set local role authenticated;

select throws_ok(
  $$insert into public.zones (id, match_id, name, rows, seats_per_row)
    values ('sl-past-new', 'sl-past', 'New Stand', array['B']::text[], 2)$$,
  'P0001',
  'Seating is locked after kickoff',
  'a completed fixture refuses a new zone'
);

select throws_ok(
  $$insert into public.zones (id, match_id, name, rows, seats_per_row)
    values ('sl-live-new', 'sl-live', 'Live Stand', array['B']::text[], 2)$$,
  'P0001',
  'Seating is locked after kickoff',
  'a live fixture refuses a new zone'
);

select lives_ok(
  $$insert into public.zones (id, match_id, name, rows, seats_per_row)
    values ('sl-future-zone', 'sl-future', 'Future Stand', array['A']::text[], 2)$$,
  'a scheduled fixture still accepts a zone'
);

select throws_ok(
  $$insert into public.match_zone_prices (match_id, zone_id, price_minor_units)
    values ('sl-past', 'sl-past-zone', 35000)$$,
  'P0001',
  'Seating is locked after kickoff',
  'a completed fixture refuses a price'
);

select throws_ok(
  $$insert into public.seats (id, zone_id, row_label, number)
    values ('sl-past-seat', 'sl-past-zone', 'A', 1)$$,
  'P0001',
  'Seating is locked after kickoff',
  'a completed fixture refuses a seat'
);

reset role;
select set_config('request.jwt.claims', '', true);
select set_config('request.jwt.claim.sub', '', true);

-- The trusted setup path is not an admin write; seeds and fixtures still build
-- historical data.
select lives_ok(
  $$insert into public.seats (id, zone_id, row_label, number)
    values ('sl-past-setup-seat', 'sl-past-zone', 'A', 1)$$,
  'the trusted setup path can still build a past fixture'
);

select * from finish();
rollback;
