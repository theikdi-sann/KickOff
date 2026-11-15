-- C7.4 / 0046 — per-club uniques: a name is unique inside a club, not
-- worldwide.
--
-- One club per deployment made the difference invisible: `venues.name` and
-- `app_settings.key` were globally unique and `gates.name` was not unique at
-- all. Two clubs in one database must each keep their own "Twin Arena",
-- their own `club_name` setting and their own "Twin Gate" — so the keys move
-- under `tenant_id`. The suite pins both halves of the rule: the same value
-- may exist in a second club, and never twice in one, including in the exact
-- shape the console and the seed write (`on conflict (tenant_id, …)`).
--
--   U-1..U-6   venues.name — per club, the composite upsert target, the
--              global unique gone
--   U-7..U-10  app_settings.key — the primary key becomes (tenant_id, key)
--   U-11..U-13 gates.name — a club-scoped unique that never existed before
begin;
select plan(13);

-- ── fixtures: a second club ──────────────────────────────────────────────────
select public.provision_tenant('Uniq FC', 'uniq-fc');

-- ── venues.name ──────────────────────────────────────────────────────────────
-- tenant_id comes from the default the console writes against.
insert into public.venues (id, name, city)
values ('twin-a', 'Twin Arena', 'Bangkok');

select throws_ok(
  $$insert into public.venues (id, name, city) values ('twin-a2', 'Twin Arena', 'Bangkok')$$,
  '23505', null,
  'U-1 the same venue name twice in one club is refused'
);

select lives_ok(
  $$insert into public.venues (id, name, tenant_id, city)
    values ('twin-b', 'Twin Arena',
            (select id from public.tenants where slug = 'uniq-fc'), 'Chiang Mai')$$,
  'U-2 the same name in a second club is allowed'
);

-- the console's resolveVenueId upsert shape (matches.ts)
select lives_ok(
  $$insert into public.venues (id, name, city)
    values ('twin-a3', 'Twin Arena', 'Phuket')
    on conflict (tenant_id, name) do update set city = excluded.city$$,
  'U-3 the console conflict target (tenant_id, name) exists'
);

select is(
  (select city from public.venues where id = 'twin-a'),
  'Phuket',
  'U-4 the upsert resolved to the existing row of this club'
);

select is(
  (select count(*) from pg_constraint
    where conrelid = 'public.venues'::regclass and conname = 'venues_name_key'),
  0::bigint,
  'U-5 the global venues_name_key is gone'
);

select col_is_unique('public', 'venues', array['tenant_id', 'name'],
  'U-6 venues carries UNIQUE (tenant_id, name)');

-- ── app_settings.key ────────────────────────────────────────────────────────
insert into public.app_settings (key, value)
values ('twin_key', '"one"'::jsonb);

select throws_ok(
  $$insert into public.app_settings (key, value) values ('twin_key', '"two"'::jsonb)$$,
  '23505', null,
  'U-7 the same key twice in one club is refused'
);

select lives_ok(
  $$insert into public.app_settings (key, value, tenant_id)
    values ('twin_key', '"one"'::jsonb,
            (select id from public.tenants where slug = 'uniq-fc'))$$,
  'U-8 the same key in a second club is allowed'
);

-- the console's settings upsert shape (settings.ts)
select lives_ok(
  $$insert into public.app_settings (key, value)
    values ('twin_key', '"updated"'::jsonb)
    on conflict (tenant_id, key) do update set value = excluded.value$$,
  'U-9 the console conflict target (tenant_id, key) exists'
);

select col_is_pk('public', 'app_settings', array['tenant_id', 'key'],
  'U-10 the settings primary key is (tenant_id, key)');

-- ── gates.name ──────────────────────────────────────────────────────────────
-- gates.venue_id is NOT NULL and composite: the second club's gate stands at
-- the second club's venue (twin-b, created in U-2).
insert into public.gates (id, name, venue_id)
values ('twin-g', 'Twin Gate', 'v_kickoff');

select throws_ok(
  $$insert into public.gates (id, name, venue_id) values ('twin-g2', 'Twin Gate', 'v_kickoff')$$,
  '23505', null,
  'U-11 the same gate name twice in one club is refused'
);

select lives_ok(
  $$insert into public.gates (id, name, venue_id, tenant_id)
    values ('twin-g-b', 'Twin Gate', 'twin-b',
            (select id from public.tenants where slug = 'uniq-fc'))$$,
  'U-12 the same gate name in a second club is allowed'
);

select col_is_unique('public', 'gates', array['tenant_id', 'name'],
  'U-13 gates carries UNIQUE (tenant_id, name)');

select * from finish();
rollback;
