-- C10.10 — one call builds the fixture and the ground it needs.
--
-- The fixture dialog must not leave a half-created venue behind when a zone,
-- a gate or a price is wrong. `admin_create_match_full()` takes the match,
-- an existing or new venue, the zones to add, the gates to create and the
-- gates to assign, and does all of it in one transaction.
--
-- The locked rules this suite pins:
--
--   CMF-1…CMF-6   a new away venue, its zones and seats, a new stand gate and
--                 the fixture are one call; the clone keeps its provenance
--   CMF-7…CMF-11  an existing venue can gain zones; prices are per fixture
--   CMF-12        a second home venue is refused with a readable error
--   CMF-13        a venue without zones is refused
--   CMF-14        a gate from another ground cannot be assigned
--   CMF-15        a duplicate venue name fails on the per-club key
--   CMF-16        only an admin may call it
--   CMF-17        a past kickoff is refused
--   CMF-18        every failure rolls the whole call back — no orphan venue
begin;
select plan(22);

-- ── fixtures ────────────────────────────────────────────────────────────────
insert into auth.users (id, email, raw_app_meta_data) values
  ('00000000-0000-0000-0000-0000000000e1', 'cmf.admin@kickoff.test',
   '{"role":"admin"}'::jsonb),
  ('00000000-0000-0000-0000-0000000000e2', 'cmf.fan@kickoff.test',
   '{"role":"customer"}'::jsonb)
on conflict (id) do nothing;

insert into public.staff_members (id, tenant_id, staff_role)
values ('00000000-0000-0000-0000-0000000000e1',
        '00000000-0000-0000-0000-000000000001', 'admin')
on conflict (id, tenant_id) do nothing;

-- An away ground that already has a layout and a gate, so the same call can
-- be asked to add a zone and admit an existing turnstile.
insert into public.venues (id, name, is_home) values
  ('cmf-existing', 'CMF Existing Ground', false),
  ('cmf-other', 'CMF Other Ground', false)
on conflict (id) do nothing;

insert into public.venue_zones
  (id, venue_id, name, rows, seats_per_row, default_price_minor_units)
values ('cmf-vz-east', 'cmf-existing', 'East Stand', array['A']::text[], 2, 30000)
on conflict (id) do nothing;

insert into public.venue_seats (tenant_id, venue_zone_id, row_label, number)
select '00000000-0000-0000-0000-000000000001', 'cmf-vz-east', 'A', n
from generate_series(1, 2) as n
on conflict (venue_zone_id, row_label, number) do nothing;

insert into public.gates (id, name, venue_id, tenant_id) values
  ('cmf-gate-east', 'CMF East Gate', 'cmf-existing',
   '00000000-0000-0000-0000-000000000001'),
  ('cmf-gate-other', 'CMF Other Gate', 'cmf-other',
   '00000000-0000-0000-0000-000000000001')
on conflict (id) do nothing;

-- ── act as the club admin ───────────────────────────────────────────────────
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000e1', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000e1","role":"authenticated","app_metadata":{"role":"admin"}}',
  true
);
set local role authenticated;

-- ── CMF-1…CMF-6 a new ground in one call ────────────────────────────────────
select lives_ok(
  $$ select public.admin_create_match_full(
       jsonb_build_object(
         'opponent', 'CMF New FC', 'opponentShort', 'CNF',
         'kickoffAt', now() + interval '3 days',
         'competition', 'Thai Premier League', 'homeAway', 'away',
         'posterColors', jsonb_build_array('#111111', '#222222'),
         'accent', '#F4C430'
       ),
       jsonb_build_object(
         'name', 'CMF New Ground', 'city', 'Bangkok',
         'address', '1 New Road', 'isHome', false
       ),
       jsonb_build_array(
         jsonb_build_object(
           'key', 'north', 'name', 'North Stand', 'description', '',
           'color', '#22C55E', 'rows', jsonb_build_array('A', 'B'),
           'seatsPerRow', 3, 'defaultPriceMinorUnits', 35000
         ),
         jsonb_build_object(
           'key', 'south', 'name', 'South Stand', 'description', '',
           'color', '#0EA5E9', 'rows', jsonb_build_array('A'),
           'seatsPerRow', 2, 'defaultPriceMinorUnits', 25000
         )
       ),
       jsonb_build_array(
         jsonb_build_object(
           'id', 'cmf-gate-north', 'name', 'CMF North Gate',
           'zoneKey', 'north', 'active', true
         )
       ),
       '{}'::text[], null
     ) $$,
  'CMF-1 a new venue, its zones and a fixture are created in one call'
);

select is(
  (select count(*) from public.matches
    where opponent = 'CMF New FC'
      and venue_id = (select id from public.venues where name = 'CMF New Ground')),
  1::bigint,
  'CMF-2 the fixture points at the new ground'
);

select is(
  (select count(*) from public.zones z
     join public.matches m on m.id = z.match_id
    where m.opponent = 'CMF New FC'),
  2::bigint,
  'CMF-3 the fixture cloned both zones'
);

select is(
  (select count(*) from public.seats s
     join public.zones z on z.id = s.zone_id
     join public.matches m on m.id = z.match_id
    where m.opponent = 'CMF New FC'),
  8::bigint,
  'CMF-4 the seats were generated from rows × seats-per-row'
);

select is(
  (select count(*) from public.zones z
     join public.matches m on m.id = z.match_id
    where m.opponent = 'CMF New FC' and z.venue_zone_id is null),
  0::bigint,
  'CMF-5 every cloned zone remembers its venue zone'
);

select is(
  (select g.venue_zone_id
     from public.gates g
     join public.venue_zones vz on vz.id = g.venue_zone_id
    where g.id = 'cmf-gate-north' and vz.name = 'North Stand'),
  (select id from public.venue_zones where name = 'North Stand' and venue_id =
     (select id from public.venues where name = 'CMF New Ground')),
  'CMF-6 a new gate can name a stand created in the same call'
);

select is(
  (select count(*) from public.match_gates mg
     join public.matches m on m.id = mg.match_id
    where m.opponent = 'CMF New FC' and mg.gate_id = 'cmf-gate-north'),
  1::bigint,
  'CMF-7 the new gate is assigned to the new fixture'
);

-- ── CMF-8…CMF-12 an existing ground can gain a zone ─────────────────────────
select lives_ok(
  $$ select public.admin_create_match_full(
       jsonb_build_object(
         'opponent', 'CMF Existing FC', 'opponentShort', 'CEF',
         'kickoffAt', now() + interval '4 days',
         'competition', 'Thai Premier League', 'homeAway', 'away',
         'posterColors', jsonb_build_array('#111111', '#222222'),
         'accent', '#F4C430'
       ),
       jsonb_build_object('id', 'cmf-existing'),
       jsonb_build_array(
         jsonb_build_object(
           'key', 'west', 'name', 'West Stand', 'description', '',
           'color', '#F59E0B', 'rows', jsonb_build_array('A'),
           'seatsPerRow', 2, 'defaultPriceMinorUnits', 40000
         )
       ),
       jsonb_build_array(
         jsonb_build_object(
           'id', 'cmf-gate-west', 'name', 'CMF West Gate',
           'zoneKey', 'west', 'active', true
         )
       ),
       array['cmf-gate-east']::text[],
       jsonb_build_object('cmf-vz-east', 55000)
     ) $$,
  'CMF-8 an existing venue can gain a zone in the same call'
);

select is(
  (select count(*) from public.zones z
     join public.matches m on m.id = z.match_id
    where m.opponent = 'CMF Existing FC'),
  2::bigint,
  'CMF-9 the fixture cloned the existing and the new zone'
);

select is(
  (select p.price_minor_units
     from public.match_zone_prices p
     join public.matches m on m.id = p.match_id
     join public.zones z on z.id = p.zone_id
    where m.opponent = 'CMF Existing FC' and z.name = 'East Stand'),
  55000,
  'CMF-10 the per-fixture price overrides the venue default'
);

select is(
  (select p.price_minor_units
     from public.match_zone_prices p
     join public.matches m on m.id = p.match_id
     join public.zones z on z.id = p.zone_id
    where m.opponent = 'CMF Existing FC' and z.name = 'West Stand'),
  40000,
  'CMF-11 a new zone falls back to its own default price'
);

select is(
  (select g.venue_zone_id
     from public.gates g
     join public.venue_zones vz on vz.id = g.venue_zone_id
    where g.id = 'cmf-gate-west' and vz.name = 'West Stand'),
  (select id from public.venue_zones where name = 'West Stand' and venue_id = 'cmf-existing'),
  'CMF-12 the new gate points at the zone created with it'
);

-- ── the refusal paths ───────────────────────────────────────────────────────
select throws_ok(
  $$ select public.admin_create_match_full(
       jsonb_build_object(
         'opponent', 'CMF Home Two', 'opponentShort', 'CH2',
         'kickoffAt', now() + interval '5 days',
         'posterColors', jsonb_build_array('#111111', '#222222'),
         'accent', '#F4C430'
       ),
       jsonb_build_object('name', 'CMF Second Home', 'isHome', true),
       jsonb_build_array(
         jsonb_build_object(
           'name', 'Only Stand', 'rows', jsonb_build_array('A'),
           'seatsPerRow', 1, 'defaultPriceMinorUnits', 10000
         )
       )
     ) $$,
  '22023', null,
  'CMF-13 a second home venue is refused'
);

select is(
  (select count(*) from public.venues where name = 'CMF Second Home'),
  0::bigint,
  'CMF-14 the refused home venue was not created'
);

select throws_ok(
  $$ select public.admin_create_match_full(
       jsonb_build_object(
         'opponent', 'CMF No Zones', 'opponentShort', 'CNZ',
         'kickoffAt', now() + interval '5 days',
         'posterColors', jsonb_build_array('#111111', '#222222'),
         'accent', '#F4C430'
       ),
       jsonb_build_object('name', 'CMF No Zone Ground', 'isHome', false),
       '[]'::jsonb
     ) $$,
  '22023', null,
  'CMF-15 a venue without zones is refused'
);

select is(
  (select count(*) from public.venues where name = 'CMF No Zone Ground'),
  0::bigint,
  'CMF-16 the refused venue was not created'
);

select throws_ok(
  $$ select public.admin_create_match_full(
       jsonb_build_object(
         'opponent', 'CMF Wrong Gate', 'opponentShort', 'CWG',
         'kickoffAt', now() + interval '5 days',
         'posterColors', jsonb_build_array('#111111', '#222222'),
         'accent', '#F4C430'
       ),
       jsonb_build_object('id', 'cmf-existing'),
       '[]'::jsonb, '[]'::jsonb,
       array['cmf-gate-other']::text[], null
     ) $$,
  '22023', null,
  'CMF-17 a gate from another ground cannot be assigned'
);

select is(
  (select count(*) from public.matches where opponent = 'CMF Wrong Gate'),
  0::bigint,
  'CMF-18 the refused call left no fixture behind'
);

-- A duplicate venue name is the per-club key's failure, not a silent second
-- ground. It runs last because it targets the venue CMF-1 created.
select throws_ok(
  $$ select public.admin_create_match_full(
       jsonb_build_object(
         'opponent', 'CMF Duplicate', 'opponentShort', 'CDP',
         'kickoffAt', now() + interval '6 days',
         'posterColors', jsonb_build_array('#111111', '#222222'),
         'accent', '#F4C430'
       ),
       jsonb_build_object('name', 'CMF New Ground', 'isHome', false),
       jsonb_build_array(
         jsonb_build_object(
           'name', 'Only Stand', 'rows', jsonb_build_array('A'),
           'seatsPerRow', 1, 'defaultPriceMinorUnits', 10000
         )
       )
     ) $$,
  '23505', null,
  'CMF-19 a duplicate venue name fails on the per-club key'
);

-- A past kickoff is refused after the venue would have been inserted, so the
-- rollback is visible.
select throws_ok(
  $$ select public.admin_create_match_full(
       jsonb_build_object(
         'opponent', 'CMF Past', 'opponentShort', 'CPS',
         'kickoffAt', now() - interval '1 hour',
         'posterColors', jsonb_build_array('#111111', '#222222'),
         'accent', '#F4C430'
       ),
       jsonb_build_object('name', 'CMF Past Ground', 'isHome', false),
       jsonb_build_array(
         jsonb_build_object(
           'name', 'Only Stand', 'rows', jsonb_build_array('A'),
           'seatsPerRow', 1, 'defaultPriceMinorUnits', 10000
         )
       )
     ) $$,
  'P0001', null,
  'CMF-20 a kickoff in the past is refused'
);

select is(
  (select count(*) from public.venues where name = 'CMF Past Ground'),
  0::bigint,
  'CMF-21 the rolled-back venue does not exist'
);

-- ── only an admin ───────────────────────────────────────────────────────────
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000e2', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000e2","role":"authenticated","app_metadata":{"role":"customer"}}',
  true
);

select throws_ok(
  $$ select public.admin_create_match_full(
       jsonb_build_object(
         'opponent', 'CMF Fan Call', 'opponentShort', 'CFC',
         'kickoffAt', now() + interval '6 days',
         'posterColors', jsonb_build_array('#111111', '#222222'),
         'accent', '#F4C430'
       ),
       jsonb_build_object('id', 'cmf-existing')
     ) $$,
  '42501', null,
  'CMF-22 a non-admin cannot create a fixture'
);

select * from finish();
rollback;
