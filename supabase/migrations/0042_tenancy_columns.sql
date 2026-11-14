-- 0042_tenancy_columns — C6.3: tenant columns, composite foreign keys and
-- tenant-led indexes on every scoped table.
--
-- 0040 created the club row, 0041 split identity from authority. This step
-- makes the data itself tenant-owned (ADR-002):
--   * `tenant_id NOT NULL` on every tenant-scoped table, indexed leading;
--   * `UNIQUE (id, tenant_id)` on every parent a child can point at;
--   * composite foreign keys `(child_id, tenant_id) → parent (id, tenant_id)`,
--     so a cross-club reference is rejected by the database even if a policy
--     were wrong.
--
-- The column keeps a DEFAULT of the default club so the single-club code keeps
-- inserting unchanged (the same bridge as `profiles.role` in 0041). The default
-- is removed at 0045, when writes become tenant-aware and a missing `tenant_id`
-- must fail loudly instead of silently landing in club one.
--
-- Constraint adds use `NOT VALID` + `VALIDATE`: the brief lock is taken by the
-- add, and the row scan does not block writes. On a fresh database the scan is
-- trivial; on a live one it is the documented `scan_events` lock window.
--
-- Every statement is idempotent — dependent keys are dropped before the
-- uniques that block them and every rebuilt index is dropped by name — so the
-- file can be re-applied after a partial failure.
--
-- A composite key also changes what PostgREST can infer: a view must expose
-- *every* column of the key for the embed to resolve, so the two views that
-- join through these keys regain the club column at the end of this file.
--
-- Deliberately out of scope here (they belong to later steps):
--   * `venues.name` / `app_settings.key` / `gates.name` become per-tenant
--     uniques in 0046 with the `app_settings` primary-key change — the console
--     upserts on `name`/`key` today and must keep working until then;
--   * `device_tokens`, `stripe_events`, `rate_limits`, `app_secrets`,
--     `profiles` and `fans` stay global (a device or a person spans clubs).

-- ── the bridge default ──────────────────────────────────────────────────────
-- The literal below is the only club this deployment serves until 0045. It is
-- repeated on every table on purpose: a migration is a historical record, and
-- the removal in 0045 must touch each column explicitly.

-- ── columns ─────────────────────────────────────────────────────────────────
alter table public.venues
  add column if not exists tenant_id uuid not null
    default '00000000-0000-0000-0000-000000000001';

alter table public.matches
  add column if not exists tenant_id uuid not null
    default '00000000-0000-0000-0000-000000000001';

alter table public.zones
  add column if not exists tenant_id uuid not null
    default '00000000-0000-0000-0000-000000000001';

alter table public.seats
  add column if not exists tenant_id uuid not null
    default '00000000-0000-0000-0000-000000000001';

alter table public.gates
  add column if not exists tenant_id uuid not null
    default '00000000-0000-0000-0000-000000000001';

alter table public.news_items
  add column if not exists tenant_id uuid not null
    default '00000000-0000-0000-0000-000000000001';

alter table public.orders
  add column if not exists tenant_id uuid not null
    default '00000000-0000-0000-0000-000000000001';

alter table public.order_seats
  add column if not exists tenant_id uuid not null
    default '00000000-0000-0000-0000-000000000001';

alter table public.tickets
  add column if not exists tenant_id uuid not null
    default '00000000-0000-0000-0000-000000000001';

alter table public.seat_holds
  add column if not exists tenant_id uuid not null
    default '00000000-0000-0000-0000-000000000001';

alter table public.scan_events
  add column if not exists tenant_id uuid not null
    default '00000000-0000-0000-0000-000000000001';

alter table public.audit_logs
  add column if not exists tenant_id uuid not null
    default '00000000-0000-0000-0000-000000000001';

alter table public.app_settings
  add column if not exists tenant_id uuid not null
    default '00000000-0000-0000-0000-000000000001';

-- ── every scoped row belongs to a club ──────────────────────────────────────
alter table public.venues drop constraint if exists venues_tenant_id_fkey;
alter table public.venues add constraint venues_tenant_id_fkey
  foreign key (tenant_id) references public.tenants (id) not valid;
alter table public.venues validate constraint venues_tenant_id_fkey;

alter table public.matches drop constraint if exists matches_tenant_id_fkey;
alter table public.matches add constraint matches_tenant_id_fkey
  foreign key (tenant_id) references public.tenants (id) not valid;
alter table public.matches validate constraint matches_tenant_id_fkey;

alter table public.zones drop constraint if exists zones_tenant_id_fkey;
alter table public.zones add constraint zones_tenant_id_fkey
  foreign key (tenant_id) references public.tenants (id) not valid;
alter table public.zones validate constraint zones_tenant_id_fkey;

alter table public.seats drop constraint if exists seats_tenant_id_fkey;
alter table public.seats add constraint seats_tenant_id_fkey
  foreign key (tenant_id) references public.tenants (id) not valid;
alter table public.seats validate constraint seats_tenant_id_fkey;

alter table public.gates drop constraint if exists gates_tenant_id_fkey;
alter table public.gates add constraint gates_tenant_id_fkey
  foreign key (tenant_id) references public.tenants (id) not valid;
alter table public.gates validate constraint gates_tenant_id_fkey;

alter table public.news_items drop constraint if exists news_items_tenant_id_fkey;
alter table public.news_items add constraint news_items_tenant_id_fkey
  foreign key (tenant_id) references public.tenants (id) not valid;
alter table public.news_items validate constraint news_items_tenant_id_fkey;

alter table public.orders drop constraint if exists orders_tenant_id_fkey;
alter table public.orders add constraint orders_tenant_id_fkey
  foreign key (tenant_id) references public.tenants (id) not valid;
alter table public.orders validate constraint orders_tenant_id_fkey;

alter table public.order_seats drop constraint if exists order_seats_tenant_id_fkey;
alter table public.order_seats add constraint order_seats_tenant_id_fkey
  foreign key (tenant_id) references public.tenants (id) not valid;
alter table public.order_seats validate constraint order_seats_tenant_id_fkey;

alter table public.tickets drop constraint if exists tickets_tenant_id_fkey;
alter table public.tickets add constraint tickets_tenant_id_fkey
  foreign key (tenant_id) references public.tenants (id) not valid;
alter table public.tickets validate constraint tickets_tenant_id_fkey;

alter table public.seat_holds drop constraint if exists seat_holds_tenant_id_fkey;
alter table public.seat_holds add constraint seat_holds_tenant_id_fkey
  foreign key (tenant_id) references public.tenants (id) not valid;
alter table public.seat_holds validate constraint seat_holds_tenant_id_fkey;

alter table public.scan_events drop constraint if exists scan_events_tenant_id_fkey;
alter table public.scan_events add constraint scan_events_tenant_id_fkey
  foreign key (tenant_id) references public.tenants (id) not valid;
alter table public.scan_events validate constraint scan_events_tenant_id_fkey;

alter table public.audit_logs drop constraint if exists audit_logs_tenant_id_fkey;
alter table public.audit_logs add constraint audit_logs_tenant_id_fkey
  foreign key (tenant_id) references public.tenants (id) not valid;
alter table public.audit_logs validate constraint audit_logs_tenant_id_fkey;

alter table public.app_settings drop constraint if exists app_settings_tenant_id_fkey;
alter table public.app_settings add constraint app_settings_tenant_id_fkey
  foreign key (tenant_id) references public.tenants (id) not valid;
alter table public.app_settings validate constraint app_settings_tenant_id_fkey;

-- ── drop the keys the new uniques would block ───────────────────────────────
-- A unique constraint that a foreign key depends on cannot be dropped, so the
-- old single-column keys go first. Every statement here is idempotent, which
-- is what lets the migration be re-applied after a partial failure.
alter table public.matches drop constraint if exists matches_venue_id_fkey;
alter table public.zones drop constraint if exists zones_match_id_fkey;
alter table public.seats drop constraint if exists seats_zone_id_fkey;
alter table public.gates drop constraint if exists gates_match_id_fkey;
alter table public.orders drop constraint if exists orders_match_id_fkey;
alter table public.order_seats drop constraint if exists order_seats_order_id_fkey;
alter table public.order_seats drop constraint if exists order_seats_seat_id_fkey;
alter table public.order_seats drop constraint if exists order_seats_ticket_id_fkey;
alter table public.tickets drop constraint if exists tickets_order_id_fkey;
alter table public.tickets drop constraint if exists tickets_order_seat_id_fkey;
alter table public.tickets drop constraint if exists tickets_match_id_fkey;
alter table public.tickets drop constraint if exists tickets_seat_id_fkey;
alter table public.seat_holds drop constraint if exists seat_holds_seat_id_fkey;
alter table public.scan_events drop constraint if exists scan_events_ticket_id_fkey;
alter table public.scan_events drop constraint if exists scan_events_gate_id_fkey;

-- ── parents a child can point at ────────────────────────────────────────────
-- A composite FK needs a unique key over exactly `(id, tenant_id)`.
alter table public.venues drop constraint if exists venues_id_tenant_key;
alter table public.venues add constraint venues_id_tenant_key unique (id, tenant_id);

alter table public.matches drop constraint if exists matches_id_tenant_key;
alter table public.matches add constraint matches_id_tenant_key unique (id, tenant_id);

alter table public.zones drop constraint if exists zones_id_tenant_key;
alter table public.zones add constraint zones_id_tenant_key unique (id, tenant_id);

alter table public.seats drop constraint if exists seats_id_tenant_key;
alter table public.seats add constraint seats_id_tenant_key unique (id, tenant_id);

alter table public.gates drop constraint if exists gates_id_tenant_key;
alter table public.gates add constraint gates_id_tenant_key unique (id, tenant_id);

alter table public.orders drop constraint if exists orders_id_tenant_key;
alter table public.orders add constraint orders_id_tenant_key unique (id, tenant_id);

alter table public.order_seats drop constraint if exists order_seats_id_tenant_key;
alter table public.order_seats add constraint order_seats_id_tenant_key unique (id, tenant_id);

alter table public.tickets drop constraint if exists tickets_id_tenant_key;
alter table public.tickets add constraint tickets_id_tenant_key unique (id, tenant_id);

-- ── composite foreign keys ──────────────────────────────────────────────────
-- `matches.venue_id` — a match cannot point at another club's venue.
alter table public.matches add constraint matches_venue_id_fkey
  foreign key (venue_id, tenant_id)
  references public.venues (id, tenant_id) not valid;
alter table public.matches validate constraint matches_venue_id_fkey;

-- `zones.match_id` — a zone belongs to its own club's match.
alter table public.zones add constraint zones_match_id_fkey
  foreign key (match_id, tenant_id)
  references public.matches (id, tenant_id) on delete cascade not valid;
alter table public.zones validate constraint zones_match_id_fkey;

-- `seats.zone_id` — a seat belongs to its own club's zone.
alter table public.seats add constraint seats_zone_id_fkey
  foreign key (zone_id, tenant_id)
  references public.zones (id, tenant_id) on delete cascade not valid;
alter table public.seats validate constraint seats_zone_id_fkey;

-- `gates.match_id` — a gate may outlive its match, so only `match_id` is
-- cleared; `tenant_id` is NOT NULL and must survive.
alter table public.gates add constraint gates_match_id_fkey
  foreign key (match_id, tenant_id)
  references public.matches (id, tenant_id) on delete set null (match_id) not valid;
alter table public.gates validate constraint gates_match_id_fkey;

-- `orders.match_id` — an order is placed against its own club's match.
alter table public.orders add constraint orders_match_id_fkey
  foreign key (match_id, tenant_id)
  references public.matches (id, tenant_id) not valid;
alter table public.orders validate constraint orders_match_id_fkey;

-- `order_seats` — the order, the seat and the ticket are all the same club.
alter table public.order_seats add constraint order_seats_order_id_fkey
  foreign key (order_id, tenant_id)
  references public.orders (id, tenant_id) on delete cascade not valid;
alter table public.order_seats validate constraint order_seats_order_id_fkey;

alter table public.order_seats add constraint order_seats_seat_id_fkey
  foreign key (seat_id, tenant_id)
  references public.seats (id, tenant_id) not valid;
alter table public.order_seats validate constraint order_seats_seat_id_fkey;

alter table public.order_seats add constraint order_seats_ticket_id_fkey
  foreign key (ticket_id, tenant_id)
  references public.tickets (id, tenant_id)
  on delete set null (ticket_id) not valid;
alter table public.order_seats validate constraint order_seats_ticket_id_fkey;

-- `tickets` — the ticket, its order, its order seat, its match and its seat
-- all belong to the same club.
alter table public.tickets add constraint tickets_order_id_fkey
  foreign key (order_id, tenant_id)
  references public.orders (id, tenant_id) on delete cascade not valid;
alter table public.tickets validate constraint tickets_order_id_fkey;

alter table public.tickets add constraint tickets_order_seat_id_fkey
  foreign key (order_seat_id, tenant_id)
  references public.order_seats (id, tenant_id) on delete cascade not valid;
alter table public.tickets validate constraint tickets_order_seat_id_fkey;

alter table public.tickets add constraint tickets_match_id_fkey
  foreign key (match_id, tenant_id)
  references public.matches (id, tenant_id) not valid;
alter table public.tickets validate constraint tickets_match_id_fkey;

alter table public.tickets add constraint tickets_seat_id_fkey
  foreign key (seat_id, tenant_id)
  references public.seats (id, tenant_id) not valid;
alter table public.tickets validate constraint tickets_seat_id_fkey;

-- `seat_holds.seat_id` — a hold is on its own club's seat.
alter table public.seat_holds add constraint seat_holds_seat_id_fkey
  foreign key (seat_id, tenant_id)
  references public.seats (id, tenant_id) on delete cascade not valid;
alter table public.seat_holds validate constraint seat_holds_seat_id_fkey;

-- `scan_events` — a scan names its own club's ticket and gate.
alter table public.scan_events add constraint scan_events_ticket_id_fkey
  foreign key (ticket_id, tenant_id)
  references public.tickets (id, tenant_id) on delete cascade not valid;
alter table public.scan_events validate constraint scan_events_ticket_id_fkey;

alter table public.scan_events add constraint scan_events_gate_id_fkey
  foreign key (gate_id, tenant_id)
  references public.gates (id, tenant_id) on delete restrict not valid;
alter table public.scan_events validate constraint scan_events_gate_id_fkey;

-- ── indexes rebuilt with tenant_id leading ─────────────────────────────────
-- The 0045 predicates are `tenant_id = current_tenant() AND …`, so the club
-- must be the leading column for the index to be usable.
drop index if exists public.matches_kickoff_at_idx;
drop index if exists public.matches_tenant_kickoff_idx;
create index matches_tenant_kickoff_idx
  on public.matches (tenant_id, kickoff_at);

drop index if exists public.matches_status_idx;
drop index if exists public.matches_tenant_status_idx;
create index matches_tenant_status_idx
  on public.matches (tenant_id, status);

drop index if exists public.matches_venue_id_idx;
drop index if exists public.matches_tenant_venue_idx;
create index matches_tenant_venue_idx
  on public.matches (tenant_id, venue_id);

drop index if exists public.zones_match_id_idx;
drop index if exists public.zones_tenant_match_idx;
create index zones_tenant_match_idx
  on public.zones (tenant_id, match_id);

drop index if exists public.seats_zone_id_idx;
drop index if exists public.seats_tenant_zone_idx;
create index seats_tenant_zone_idx
  on public.seats (tenant_id, zone_id);

drop index if exists public.seats_status_idx;
drop index if exists public.seats_tenant_status_idx;
create index seats_tenant_status_idx
  on public.seats (tenant_id, status);

drop index if exists public.gates_match_id_idx;
drop index if exists public.gates_tenant_match_idx;
create index gates_tenant_match_idx
  on public.gates (tenant_id, match_id);

drop index if exists public.orders_match_id_idx;
drop index if exists public.orders_tenant_match_idx;
create index orders_tenant_match_idx
  on public.orders (tenant_id, match_id);

drop index if exists public.orders_status_idx;
drop index if exists public.orders_tenant_status_idx;
create index orders_tenant_status_idx
  on public.orders (tenant_id, status);

drop index if exists public.orders_user_id_idx;
drop index if exists public.orders_tenant_user_idx;
create index orders_tenant_user_idx
  on public.orders (tenant_id, user_id);

drop index if exists public.order_seats_order_id_idx;
drop index if exists public.order_seats_tenant_order_idx;
create index order_seats_tenant_order_idx
  on public.order_seats (tenant_id, order_id);

drop index if exists public.order_seats_seat_id_idx;
drop index if exists public.order_seats_tenant_seat_idx;
create index order_seats_tenant_seat_idx
  on public.order_seats (tenant_id, seat_id);

drop index if exists public.tickets_match_id_idx;
drop index if exists public.tickets_tenant_match_idx;
create index tickets_tenant_match_idx
  on public.tickets (tenant_id, match_id);

drop index if exists public.tickets_order_id_idx;
drop index if exists public.tickets_tenant_order_idx;
create index tickets_tenant_order_idx
  on public.tickets (tenant_id, order_id);

drop index if exists public.tickets_user_id_idx;
drop index if exists public.tickets_tenant_user_idx;
create index tickets_tenant_user_idx
  on public.tickets (tenant_id, user_id);

drop index if exists public.seat_holds_active_seat_idx;
drop index if exists public.seat_holds_active_seat_idx;
create unique index seat_holds_active_seat_idx
  on public.seat_holds (tenant_id, seat_id) where released_at is null;

drop index if exists public.seat_holds_expires_idx;
drop index if exists public.seat_holds_tenant_expires_idx;
create index seat_holds_tenant_expires_idx
  on public.seat_holds (tenant_id, expires_at) where released_at is null;

drop index if exists public.seat_holds_group_idx;
drop index if exists public.seat_holds_tenant_group_idx;
create index seat_holds_tenant_group_idx
  on public.seat_holds (tenant_id, hold_group_id);

drop index if exists public.seat_holds_user_idx;
drop index if exists public.seat_holds_tenant_user_idx;
create index seat_holds_tenant_user_idx
  on public.seat_holds (tenant_id, user_id);

drop index if exists public.scan_events_created_at_idx;
drop index if exists public.scan_events_tenant_created_idx;
create index scan_events_tenant_created_idx
  on public.scan_events (tenant_id, created_at desc);

drop index if exists public.scan_events_ticket_id_idx;
drop index if exists public.scan_events_tenant_ticket_idx;
create index scan_events_tenant_ticket_idx
  on public.scan_events (tenant_id, ticket_id);

drop index if exists public.news_items_published_at_idx;
drop index if exists public.news_items_tenant_published_idx;
create index news_items_tenant_published_idx
  on public.news_items (tenant_id, published_at desc);

drop index if exists public.audit_logs_created_at_idx;
drop index if exists public.audit_logs_tenant_created_idx;
create index audit_logs_tenant_created_idx
  on public.audit_logs (tenant_id, created_at desc);

drop index if exists public.audit_logs_entity_idx;
drop index if exists public.audit_logs_tenant_entity_idx;
create index audit_logs_tenant_entity_idx
  on public.audit_logs (tenant_id, entity, entity_id);

drop index if exists public.audit_logs_actor_idx;
drop index if exists public.audit_logs_tenant_actor_idx;
create index audit_logs_tenant_actor_idx
  on public.audit_logs (tenant_id, actor_id);

create index if not exists venues_tenant_idx on public.venues (tenant_id);
create index if not exists app_settings_tenant_idx on public.app_settings (tenant_id);

-- ── views keep their embeds ─────────────────────────────────────────────────
-- `0042` made the catalogue foreign keys composite, and PostgREST only infers
-- an embed when the view exposes **every** column of the key. The two views
-- below exposed only half of theirs, so `zones(match_id)` stopped resolving and
-- the generated types lost the relationship. Adding the club column restores
-- the embed and is what the 0045 tenant predicate needs anyway. Columns are
-- appended, so `create or replace view` keeps the existing shape intact.

create or replace view public.zone_availability as
select
  s.zone_id,
  count(*) as total_seats,
  count(*) filter (
    where s.status = 'available'
      and not exists (
        select 1 from public.seat_holds h
        where h.seat_id = s.id
          and h.released_at is null
          and h.expires_at > now()
      )
      and not exists (
        select 1
        from public.order_seats os
        join public.orders o on o.id = os.order_id
        where os.seat_id = s.id and o.status = 'pending'
      )
  ) as available_seats,
  s.tenant_id
from public.seats s
group by s.zone_id, s.tenant_id;

create or replace view public.order_receipt_view as
select
  o.id as order_id,
  o.user_id,
  o.match_id,
  o.amount_satang,
  o.status,
  o.created_at,
  o.paid_at,
  o.payment_ref,
  p.full_name as holder,
  p.email as holder_email,
  m.opponent,
  m.kickoff_at,
  v.name as venue,
  coalesce(
    jsonb_agg(
      jsonb_build_object(
        'seatId', os.seat_id,
        'ticketId', os.ticket_id,
        'zoneName', os.zone_name,
        'row', os.row_label,
        'number', os.number,
        'priceSatang', os.price_satang
      )
      order by os.zone_name, os.row_label, os.number
    ) filter (where os.id is not null),
    '[]'::jsonb
  ) as seats,
  o.tenant_id
from public.orders o
join public.profiles p on p.id = o.user_id
join public.matches m on m.id = o.match_id
join public.venues v on v.id = m.venue_id
left join public.order_seats os on os.order_id = o.id
group by
  o.id, p.full_name, p.email, m.opponent, m.kickoff_at, v.name, o.tenant_id;
