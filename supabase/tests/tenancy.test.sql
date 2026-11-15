-- 0042 — tenant columns, composite foreign keys and tenant-led indexes (C6.3).
--
-- The suite proves the isolation foundation ADR-002 describes:
--   * every tenant-scoped table carries a NOT NULL `tenant_id` that references
--     `tenants`, and the existing rows were backfilled to the default club;
--   * every intra-app foreign key is composite `(child_id, tenant_id)`, so a
--     cross-club reference is rejected by the database, not just by a policy;
--   * a legacy insert that omits `tenant_id` still works (the bridge default),
--     while a row cannot point at another club's parent;
--   * the hot lookup indexes lead with `tenant_id` for the 0045 RLS predicates.
begin;
select plan(24);

-- ── structure ───────────────────────────────────────────────────────────────
select is(
  (select count(*)
     from (values
       ('venues'), ('matches'), ('zones'), ('seats'), ('gates'),
       ('match_gates'), ('news_items'), ('orders'), ('order_seats'), ('tickets'),
       ('seat_holds'), ('scan_events'), ('audit_logs'), ('app_settings')
     ) as scoped(name)
    where not exists (
      select 1
      from information_schema.columns c
      where c.table_schema = 'public'
        and c.table_name = scoped.name
        and c.column_name = 'tenant_id'
        and c.data_type = 'uuid'
        and c.is_nullable = 'NO'
    )),
  0::bigint,
  'every scoped table has a NOT NULL uuid tenant_id'
);

select is(
  (select count(*)
     from (values
       ('venues'), ('matches'), ('zones'), ('seats'), ('gates'),
       ('match_gates'), ('news_items'), ('orders'), ('order_seats'), ('tickets'),
       ('seat_holds'), ('scan_events'), ('audit_logs'), ('app_settings')
     ) as scoped(name)
    where not exists (
      select 1
      from pg_constraint c
      where c.conrelid = format('public.%I', scoped.name)::regclass
        and c.contype = 'f'
        and c.confrelid = 'public.tenants'::regclass
        and c.conkey = array[
          (select a.attnum
             from pg_attribute a
            where a.attrelid = c.conrelid and a.attname = 'tenant_id')
        ]
    )),
  0::bigint,
  'every scoped table has a tenant_id foreign key to tenants'
);

select ok(
  exists (
    select 1 from pg_constraint
    where conrelid = 'public.venues'::regclass
      and contype = 'u'
      and conkey = array[
        (select attnum from pg_attribute
          where attrelid = 'public.venues'::regclass and attname = 'id'),
        (select attnum from pg_attribute
          where attrelid = 'public.venues'::regclass and attname = 'tenant_id')
      ]
  ),
  'venues has a unique (id, tenant_id) the composite FKs can target'
);

-- ── composite foreign keys ──────────────────────────────────────────────────
select ok(
  exists (
    select 1 from pg_constraint
    where conrelid = 'public.matches'::regclass
      and conname = 'matches_venue_id_fkey'
      and confrelid = 'public.venues'::regclass
      and array_length(conkey, 1) = 2
      and array_length(confkey, 1) = 2
  ),
  'matches → venues is a composite foreign key'
);

select ok(
  exists (
    select 1 from pg_constraint
    where conrelid = 'public.zones'::regclass
      and conname = 'zones_match_id_fkey'
      and confrelid = 'public.matches'::regclass
      and array_length(conkey, 1) = 2
  ),
  'zones → matches is a composite foreign key'
);

select ok(
  exists (
    select 1 from pg_constraint
    where conrelid = 'public.seats'::regclass
      and conname = 'seats_zone_id_fkey'
      and confrelid = 'public.zones'::regclass
      and array_length(conkey, 1) = 2
  ),
  'seats → zones is a composite foreign key'
);

select ok(
  exists (
    select 1 from pg_constraint
    where conrelid = 'public.match_gates'::regclass
      and conname = 'match_gates_match_id_fkey'
      and confrelid = 'public.matches'::regclass
      and array_length(conkey, 1) = 2
  ),
  'match_gates → matches is a composite foreign key'
);

select ok(
  exists (
    select 1 from pg_constraint
    where conrelid = 'public.match_gates'::regclass
      and conname = 'match_gates_gate_id_fkey'
      and confrelid = 'public.gates'::regclass
      and array_length(conkey, 1) = 2
      and confdeltype = 'c'
  ),
  'match_gates → gates is a composite foreign key that cascades with its gate'
);

select ok(
  exists (
    select 1 from pg_constraint
    where conrelid = 'public.orders'::regclass
      and conname = 'orders_match_id_fkey'
      and confrelid = 'public.matches'::regclass
      and array_length(conkey, 1) = 2
  ),
  'orders → matches is a composite foreign key'
);

select is(
  (select count(*)
     from pg_constraint
    where conrelid = 'public.order_seats'::regclass
      and contype = 'f'
      and array_length(conkey, 1) = 2
      and confrelid in ('public.orders'::regclass, 'public.seats'::regclass,
                        'public.tickets'::regclass)),
  3::bigint,
  'order_seats has three composite foreign keys'
);

select is(
  (select count(*)
     from pg_constraint
    where conrelid = 'public.tickets'::regclass
      and contype = 'f'
      and array_length(conkey, 1) = 2
      and confrelid in ('public.orders'::regclass, 'public.order_seats'::regclass,
                        'public.matches'::regclass, 'public.seats'::regclass)),
  4::bigint,
  'tickets has four composite foreign keys'
);

select ok(
  exists (
    select 1 from pg_constraint
    where conrelid = 'public.seat_holds'::regclass
      and conname = 'seat_holds_seat_id_fkey'
      and confrelid = 'public.seats'::regclass
      and array_length(conkey, 1) = 2
  ),
  'seat_holds → seats is a composite foreign key'
);

select is(
  (select count(*)
     from pg_constraint
    where conrelid = 'public.scan_events'::regclass
      and contype = 'f'
      and array_length(conkey, 1) = 2
      and confrelid in ('public.tickets'::regclass, 'public.gates'::regclass,
                        'public.matches'::regclass, 'public.staff_members'::regclass)),
  5::bigint,
  'scan_events links ticket, gate, fixture, operator and undoer by composite foreign keys'
);

select ok(
  exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'audit_logs'
      and column_name = 'tenant_id'
  )
  and exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'app_settings'
      and column_name = 'tenant_id'
  ),
  'the ops tables carry a tenant_id too'
);

-- ── backfill ────────────────────────────────────────────────────────────────
select is(
  (select count(*) from public.venues
    where tenant_id <> '00000000-0000-0000-0000-000000000001')
  + (select count(*) from public.matches
      where tenant_id <> '00000000-0000-0000-0000-000000000001')
  + (select count(*) from public.zones
      where tenant_id <> '00000000-0000-0000-0000-000000000001')
  + (select count(*) from public.seats
      where tenant_id <> '00000000-0000-0000-0000-000000000001'),
  0::bigint,
  'the existing catalogue rows were backfilled to the default club'
);

-- A legacy insert still works: the column default is the bridge.
insert into public.venues (id, name)
values ('tap-venue-default', 'Tap Default Venue');

select is(
  (select tenant_id from public.venues where id = 'tap-venue-default'),
  '00000000-0000-0000-0000-000000000001'::uuid,
  'a row inserted without tenant_id lands in the default club'
);

-- ── isolation ───────────────────────────────────────────────────────────────
insert into public.tenants (id, name, slug)
values ('00000000-0000-0000-0000-0000000000e2', 'Second Club', 'second-club');

insert into public.venues (id, name, tenant_id)
values ('tap-venue-second', 'Second Club Arena',
        '00000000-0000-0000-0000-0000000000e2');

select throws_ok(
  $$ insert into public.matches
       (id, opponent, opponent_short, kickoff_at, venue_id, tenant_id)
     values ('tap-match-cross', 'Cross FC', 'CRS', now(), 'tap-venue-second',
             '00000000-0000-0000-0000-000000000001') $$,
  '23503',
  null,
  'a match cannot point at another club''s venue'
);

insert into public.matches
  (id, opponent, opponent_short, kickoff_at, venue_id, tenant_id)
values ('tap-match-second', 'Second FC', 'SFC', now(), 'tap-venue-second',
        '00000000-0000-0000-0000-0000000000e2');

select is(
  (select tenant_id from public.matches where id = 'tap-match-second'),
  '00000000-0000-0000-0000-0000000000e2'::uuid,
  'a same-club reference is accepted'
);

insert into public.gates (id, name, venue_id, tenant_id)
values ('tap-gate-second', 'Gate B', 'tap-venue-second',
        '00000000-0000-0000-0000-0000000000e2');

insert into public.match_gates (match_id, gate_id, tenant_id)
values ('tap-match-second', 'tap-gate-second',
        '00000000-0000-0000-0000-0000000000e2');

-- A club cannot assign another club's fixture to one of its own gates: the
-- join key carries the tenant on both legs.
insert into public.gates (id, name, venue_id, tenant_id)
values ('tap-gate-default', 'Default Club Gate', 'tap-venue-default',
        '00000000-0000-0000-0000-000000000001');

select throws_ok(
  $$ insert into public.match_gates (match_id, gate_id, tenant_id)
     values ('tap-match-second', 'tap-gate-default',
             '00000000-0000-0000-0000-000000000001') $$,
  '23503', null,
  'a club cannot assign another club''s fixture'
);

delete from public.matches where id = 'tap-match-second';

select is(
  (select count(*) from public.match_gates where gate_id = 'tap-gate-second'),
  0::bigint,
  'deleting a match clears its assignment but keeps the gate'
);

select is(
  (select tenant_id from public.gates where id = 'tap-gate-second'),
  '00000000-0000-0000-0000-0000000000e2'::uuid,
  'the gate keeps its club after the match is deleted'
);

-- ── indexes ─────────────────────────────────────────────────────────────────
select ok(
  (select indexdef from pg_indexes
    where schemaname = 'public' and indexname = 'matches_tenant_kickoff_idx')
  like '%(tenant_id, kickoff_at)%',
  'the matches kickoff index leads with tenant_id'
);

select ok(
  (select indexdef from pg_indexes
    where schemaname = 'public' and indexname = 'scan_events_tenant_created_idx')
  like '%(tenant_id, created_at DESC)%',
  'the scan log index leads with tenant_id'
);

select ok(
  (select indexdef from pg_indexes
    where schemaname = 'public' and indexname = 'seat_holds_active_seat_idx')
  like '%(tenant_id, seat_id)%',
  'the active-hold uniqueness leads with tenant_id'
);

select * from finish();
rollback;
