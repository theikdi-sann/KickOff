-- Stand-level gates — a turnstile serves one stand of one ground.
--
-- A gate is bolted to a venue (`gates.venue_id`) and, from this migration, to a
-- single stand inside it (`gates.venue_zone_id`). A pass for another stand is
-- refused as `wrong_zone` and the ticket is not consumed, so the fan can walk
-- to the right gate and be admitted there.
--
-- The fixture side needs the mapping too: a match zone is a clone of a venue
-- zone, so `zones.venue_zone_id` records where the clone came from and lets the
-- scanner compare a ticket's stand with the gate's.
begin;
select plan(12);

-- ── fixtures ────────────────────────────────────────────────────────────────
insert into auth.users (id, email, raw_app_meta_data) values
  ('00000000-0000-0000-0000-0000000000c1', 'gz.gatekeeper@kickoff.test',
   '{"role":"gatekeeper"}'::jsonb),
  ('00000000-0000-0000-0000-0000000000c2', 'gz.admin@kickoff.test',
   '{"role":"admin"}'::jsonb),
  ('00000000-0000-0000-0000-0000000000c3', 'gz.fan@kickoff.test',
   '{"role":"customer"}'::jsonb)
on conflict (id) do nothing;

insert into public.staff_members (id, tenant_id, staff_role)
values ('00000000-0000-0000-0000-0000000000c1',
        '00000000-0000-0000-0000-000000000001', 'gatekeeper'),
       ('00000000-0000-0000-0000-0000000000c2',
        '00000000-0000-0000-0000-000000000001', 'admin')
on conflict (id, tenant_id) do nothing;

-- This suite owns the one-home rule only in passing: move the seeded badge
-- aside so the fixture venue can be created without tripping the index.
update public.venues set is_home = false
 where tenant_id = '00000000-0000-0000-0000-000000000001';

insert into public.venues (id, name) values
  ('gz-venue', 'Gate Zone Arena'),
  ('gz-venue-2', 'Gate Zone Away Ground')
on conflict (id) do nothing;

insert into public.venue_zones
  (id, venue_id, name, rows, seats_per_row, default_price_minor_units)
values
  ('gz-vz-north', 'gz-venue', 'North Stand', array['A']::text[], 2, 35000),
  ('gz-vz-south', 'gz-venue', 'South Stand', array['A']::text[], 2, 35000),
  ('gz-vz-away', 'gz-venue-2', 'Away Stand', array['A']::text[], 2, 35000)
on conflict (venue_id, name) do nothing;

insert into public.venue_seats (venue_zone_id, row_label, number)
select vz.id, 'A', n
from public.venue_zones vz
cross join generate_series(1, 2) as n
where vz.venue_id in ('gz-venue', 'gz-venue-2')
on conflict (venue_zone_id, row_label, number) do nothing;

insert into public.matches (id, opponent, opponent_short, kickoff_at, status, venue_id)
values ('gz-m1', 'Gate Zone FC', 'GZ1', now() + interval '1 hour', 'upcoming', 'gz-venue')
on conflict (id) do nothing;

insert into public.zones (id, match_id, name, venue_zone_id, rows, seats_per_row)
values
  ('gz-z-north', 'gz-m1', 'North Stand', 'gz-vz-north', array['A']::text[], 2),
  ('gz-z-south', 'gz-m1', 'South Stand', 'gz-vz-south', array['A']::text[], 2)
on conflict (id) do nothing;

insert into public.match_zone_prices (match_id, zone_id, price_minor_units)
values ('gz-m1', 'gz-z-north', 35000), ('gz-m1', 'gz-z-south', 35000)
on conflict (match_id, zone_id) do nothing;

insert into public.seats (id, zone_id, row_label, number) values
  ('gz-seat-n1', 'gz-z-north', 'A', 1),
  ('gz-seat-s1', 'gz-z-south', 'A', 1)
on conflict (id) do nothing;

insert into public.orders (id, user_id, match_id, amount_minor_units, status) values
  ('gz-order-n', '00000000-0000-0000-0000-0000000000c3', 'gz-m1', 35000, 'paid'),
  ('gz-order-s', '00000000-0000-0000-0000-0000000000c3', 'gz-m1', 35000, 'paid')
on conflict (id) do nothing;

insert into public.order_seats
  (id, order_id, seat_id, match_id, zone_name, row_label, number, price_minor_units)
values
  ('gz-os-n', 'gz-order-n', 'gz-seat-n1', 'gz-m1', 'North Stand', 'A', 1, 35000),
  ('gz-os-s', 'gz-order-s', 'gz-seat-s1', 'gz-m1', 'South Stand', 'A', 1, 35000)
on conflict (id) do nothing;

insert into public.tickets (id, order_id, order_seat_id, user_id, match_id, seat_id, status)
values
  ('gz-t-north', 'gz-order-n', 'gz-os-n',
   '00000000-0000-0000-0000-0000000000c3', 'gz-m1', 'gz-seat-n1', 'valid'),
  ('gz-t-south', 'gz-order-s', 'gz-os-s',
   '00000000-0000-0000-0000-0000000000c3', 'gz-m1', 'gz-seat-s1', 'valid')
on conflict (id) do nothing;

-- ── GZ-1..GZ-2 the model ────────────────────────────────────────────────────
select has_column(
  'public', 'gates', 'venue_zone_id',
  'GZ-1 a gate can name the stand it serves'
);

select has_column(
  'public', 'zones', 'venue_zone_id',
  'GZ-2 a fixture zone remembers the venue zone it cloned'
);

-- ── GZ-3..GZ-4 a gate stands in one ground ──────────────────────────────────
select lives_ok(
  $$insert into public.gates (id, name, venue_id, venue_zone_id)
    values ('gz-gate-north', 'North Turnstile', 'gz-venue', 'gz-vz-north')$$,
  'GZ-3 a gate may serve a stand of its own ground'
);

select throws_ok(
  $$insert into public.gates (id, name, venue_id, venue_zone_id)
    values ('gz-gate-bad', 'Wrong Ground Gate', 'gz-venue', 'gz-vz-away')$$,
  '23514', null,
  'GZ-4 a gate cannot serve another ground''s stand'
);

-- ── GZ-5 an assignment cannot cross grounds ─────────────────────────────────
insert into public.gates (id, name, venue_id, active)
values ('gz-gate-any', 'Any Stand Gate', 'gz-venue', true),
       ('gz-gate-away', 'GZ Away Gate', 'gz-venue-2', true)
on conflict (id) do nothing;

select throws_ok(
  $$insert into public.match_gates (match_id, gate_id)
    values ('gz-m1', 'gz-gate-away')$$,
  '23514', null,
  'GZ-5 a gate from another ground cannot admit this fixture'
);

insert into public.match_gates (match_id, gate_id)
values ('gz-m1', 'gz-gate-north'), ('gz-m1', 'gz-gate-any')
on conflict do nothing;

-- ── GZ-6..GZ-9 scanning compares the ticket's stand ─────────────────────────
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c1', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated","app_metadata":{"role":"gatekeeper"}}',
  true
);
set local role authenticated;

select is(
  (public.scan_ticket('gz-t-north', 'gz-gate-north',
     '00000000-0000-0000-0000-0000000000c1', 'gz-key-1') ->> 'code'),
  'valid',
  'GZ-6 the right stand at the right gate is admitted'
);

select is(
  (public.scan_ticket('gz-t-south', 'gz-gate-north',
     '00000000-0000-0000-0000-0000000000c1', 'gz-key-2') ->> 'code'),
  'wrong_zone',
  'GZ-7 a pass for another stand is refused as wrong_zone'
);

select is(
  (select status::text from public.tickets where id = 'gz-t-south'),
  'valid',
  'GZ-8 a wrong-stand refusal does not consume the pass'
);

select is(
  (select result::text from public.scan_events where idempotency_key = 'gz-key-2'),
  'wrong_zone',
  'GZ-9 the refusal is recorded in the scan log'
);

-- A gate without a stand admits the whole ground.
select is(
  (public.scan_ticket('gz-t-south', 'gz-gate-any',
     '00000000-0000-0000-0000-0000000000c1', 'gz-key-3') ->> 'code'),
  'valid',
  'GZ-10 a whole-ground gate admits any stand'
);

-- ── GZ-11..GZ-12 the clone carries the mapping ──────────────────────────────
reset role;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c2', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000c2","role":"authenticated","app_metadata":{"role":"admin"}}',
  true
);
set local role authenticated;

select lives_ok(
  $$select public.admin_create_match_from_venue(
      jsonb_build_object(
        'opponent', 'Cloned Zone FC', 'opponentShort', 'CZF',
        'kickoffAt', now() + interval '4 days',
        'venueId', 'gz-venue', 'competition', 'Thai Premier League',
        'homeAway', 'home',
        'posterColors', jsonb_build_array('#0B6B3A', '#052E1A'),
        'accent', '#F4C430'
      ),
      array['gz-gate-north'], null
    )$$,
  'GZ-11 a fixture can be created from a ground with stand gates'
);

select is(
  (select z.venue_zone_id
     from public.zones z
     join public.matches m on m.id = z.match_id
    where m.opponent = 'Cloned Zone FC' and z.name = 'North Stand'),
  'gz-vz-north',
  'GZ-12 the cloned zone points back at the venue zone'
);

select * from finish();
rollback;
