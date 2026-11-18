-- Phase 2 — a venue owns its physical layout.
--
-- The venue is the ground: one home venue per club, zones with generated
-- seats, a capacity derived from those seats, and gates that already belong to
-- the venue. A fixture created from a venue clones that layout into the
-- match-scoped inventory the sale path already understands.
begin;
select plan(11);

-- This suite owns the one-home rule; move the seeded home badge aside inside
-- the rolled-back transaction so the fixture can claim it.
update public.venues set is_home = false
 where tenant_id = '00000000-0000-0000-0000-000000000001';

insert into auth.users (id, email, raw_app_meta_data)
values ('00000000-0000-0000-0000-0000000000f7', 'venuelayout@kickoff.test',
        '{"role":"admin"}'::jsonb)
on conflict (id) do nothing;
insert into public.staff_members (id, tenant_id, staff_role)
values ('00000000-0000-0000-0000-0000000000f7',
        '00000000-0000-0000-0000-000000000001', 'admin')
on conflict (id, tenant_id) do update set staff_role = excluded.staff_role;

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000f7', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000f7","role":"authenticated","app_metadata":{"role":"admin"}}',
  true
);
set local role authenticated;

-- 1. A club may have exactly one home ground.
select lives_ok(
  $$insert into public.venues (id, name, is_home)
    values ('vl-home', 'Layout Home', true)$$,
  'an admin can create the home venue'
);
select throws_ok(
  $$insert into public.venues (id, name, is_home)
    values ('vl-home-2', 'Second Home', true)$$,
  '23505',
  null,
  'a second home venue is refused'
);

-- 2–3. A venue zone generates its seats and capacity is derived from them.
select lives_ok(
  $$select public.admin_save_venue_zone(
      null, 'vl-home',
      '{"name":"North Stand","description":"Loud end","color":"#22C55E",
        "rows":["A","B"],"seatsPerRow":2,"defaultPriceMinorUnits":35000}'::jsonb
    )$$,
  'an admin can create a venue zone'
);
select is(
  (select count(*)::int from public.venue_seats vs
   join public.venue_zones vz on vz.id = vs.venue_zone_id
   where vz.venue_id = 'vl-home'),
  4,
  'the zone generated its seats'
);
select is(
  (select capacity::int from public.venue_capacity where venue_id = 'vl-home'),
  4,
  'capacity is the seat count, not a typed number'
);

-- 4. A gate at the venue.
insert into public.gates (id, name, venue_id, active)
values ('vl-gate', 'Layout Gate', 'vl-home', true)
on conflict (id) do nothing;

-- 5–7. Creating a fixture clones layout, prices and gates atomically.
select lives_ok(
  $$select public.admin_create_match_from_venue(
      jsonb_build_object(
        'opponent', 'Clone FC', 'opponentShort', 'CLN',
        'kickoffAt', now() + interval '3 days',
        'venueId', 'vl-home', 'competition', 'Thai Premier League',
        'homeAway', 'home',
        'posterColors', jsonb_build_array('#0B6B3A', '#052E1A'),
        'accent', '#F4C430'
      ),
      array['vl-gate'],
      (select jsonb_object_agg(id, default_price_minor_units)
         from public.venue_zones where venue_id = 'vl-home')
    )$$,
  'a fixture can be created from a venue'
);

select is(
  (select count(*)::int
   from public.zones z
   join public.matches m on m.id = z.match_id
   where m.opponent = 'Clone FC'),
  1,
  'the fixture received the venue zone'
);
select is(
  (select count(*)::int
   from public.seats s
   join public.zones z on z.id = s.zone_id
   join public.matches m on m.id = z.match_id
   where m.opponent = 'Clone FC'),
  4,
  'the fixture received the generated seats'
);
select is(
  (select count(*)::int
   from public.match_gates mg
   join public.matches m on m.id = mg.match_id
   where m.opponent = 'Clone FC'),
  1,
  'the fixture received its gates'
);

-- 8. A fixture in the past is refused: the clock owns that match.
select throws_ok(
  $$select public.admin_create_match_from_venue(
      jsonb_build_object(
        'opponent', 'Past FC', 'opponentShort', 'PST',
        'kickoffAt', now() - interval '1 hour',
        'venueId', 'vl-home', 'competition', 'Thai Premier League',
        'homeAway', 'home',
        'posterColors', jsonb_build_array('#0B6B3A', '#052E1A'),
        'accent', '#F4C430'
      ), null, null
    )$$,
  'P0001',
  null,
  'a kickoff in the past is refused'
);

-- 9. A non-admin cannot use the RPC.
reset role;
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000f8', 'venuelayoutfan@kickoff.test')
on conflict (id) do nothing;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000f8', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000f8","role":"authenticated","app_metadata":{"role":"customer"}}',
  true
);
set local role authenticated;
select throws_ok(
  $$select public.admin_create_match_from_venue('{}'::jsonb, null, null)$$,
  '42501',
  null,
  'a non-admin cannot create a fixture from a venue'
);

select * from finish();
rollback;
