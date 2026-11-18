-- 0063 — the venue owns its physical layout.
--
-- Option A of the venue plan: a venue is the ground (one home venue per club)
-- and carries zones, generated seats and a derived capacity. Gates already
-- belong to the venue. Creating a fixture clones that layout into the
-- match-scoped inventory the sale path understands, so the money, hold and
-- ticket model is untouched and a played fixture can never be rewritten.

-- ── the ground ──────────────────────────────────────────────────────────────
alter table public.venues add column if not exists is_home boolean not null default false;

drop index if exists public.venues_one_home_per_club;
create unique index venues_one_home_per_club
  on public.venues (tenant_id)
  where is_home;

-- Backfill: the seeded home ground, then the earliest venue of any other club.
update public.venues
  set is_home = true
  where id = 'v_kickoff';

update public.venues v
  set is_home = true
  where not exists (
    select 1 from public.venues home
    where home.tenant_id = v.tenant_id and home.is_home
  )
    and v.id = (
      select id from public.venues first
      where first.tenant_id = v.tenant_id
      order by created_at, id
      limit 1
    );

-- ── the physical zones and seats ────────────────────────────────────────────
create table if not exists public.venue_zones (
  id text primary key default ('vz_' || replace(gen_random_uuid()::text, '-', '')),
  tenant_id uuid not null default public.current_tenant()
    references public.tenants (id) on delete cascade,
  venue_id text not null,
  name text not null,
  description text not null default '',
  color text not null default '#22C55E',
  rows text[] not null default '{}'::text[],
  seats_per_row integer not null check (seats_per_row > 0 and seats_per_row <= 200),
  default_price_minor_units integer not null check (default_price_minor_units >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (venue_id, name),
  unique (id, tenant_id),
  foreign key (venue_id, tenant_id)
    references public.venues (id, tenant_id) on delete cascade
);

create index if not exists venue_zones_venue_idx on public.venue_zones (venue_id);

drop trigger if exists venue_zones_set_updated_at on public.venue_zones;
create trigger venue_zones_set_updated_at
before update on public.venue_zones
for each row execute function public.set_updated_at();

create table if not exists public.venue_seats (
  id text primary key default ('vs_' || replace(gen_random_uuid()::text, '-', '')),
  tenant_id uuid not null default public.current_tenant()
    references public.tenants (id) on delete cascade,
  venue_zone_id text not null,
  row_label text not null,
  number integer not null check (number > 0),
  unique (venue_zone_id, row_label, number),
  foreign key (venue_zone_id, tenant_id)
    references public.venue_zones (id, tenant_id) on delete cascade
);

create index if not exists venue_seats_zone_idx on public.venue_seats (venue_zone_id);

-- Capacity is a property of the seats, never a number an admin types twice.
create or replace view public.venue_capacity
with (security_invoker = true) as
select
  vz.venue_id,
  count(vs.id)::integer as capacity
from public.venue_zones vz
left join public.venue_seats vs on vs.venue_zone_id = vz.id
group by vz.venue_id;

grant select on public.venue_capacity to authenticated;

alter table public.venue_zones enable row level security;
alter table public.venue_seats enable row level security;

drop policy if exists venue_zones_admin_all on public.venue_zones;
create policy venue_zones_admin_all on public.venue_zones
for all to authenticated
using (tenant_id = public.current_tenant() and public.is_admin())
with check (tenant_id = public.current_tenant() and public.is_admin());

drop policy if exists venue_seats_admin_all on public.venue_seats;
create policy venue_seats_admin_all on public.venue_seats
for all to authenticated
using (tenant_id = public.current_tenant() and public.is_admin())
with check (tenant_id = public.current_tenant() and public.is_admin());

grant select on public.venue_zones, public.venue_seats to authenticated;

-- ── backfill layouts from the newest fixture per venue ──────────────────────
do $$
declare
  v_zone record;
  v_zone_id text;
begin
  for v_zone in
    select distinct on (m.venue_id, z.name)
      m.tenant_id,
      m.venue_id,
      z.name,
      z.description,
      z.color,
      z.rows,
      z.seats_per_row,
      coalesce(
        (select p.price_minor_units from public.match_zone_prices p
          where p.zone_id = z.id limit 1),
        0
      ) as default_price_minor_units
    from public.zones z
    join public.matches m on m.id = z.match_id
    order by m.venue_id, z.name, m.kickoff_at desc
  loop
    insert into public.venue_zones (
      tenant_id, venue_id, name, description, color, rows, seats_per_row,
      default_price_minor_units
    )
    values (
      v_zone.tenant_id, v_zone.venue_id, v_zone.name, v_zone.description,
      v_zone.color, v_zone.rows, v_zone.seats_per_row,
      v_zone.default_price_minor_units
    )
    on conflict (venue_id, name) do nothing
    returning id into v_zone_id;

    if v_zone_id is not null then
      insert into public.venue_seats (tenant_id, venue_zone_id, row_label, number)
      select v_zone.tenant_id, v_zone_id, row_label, number
      from unnest(v_zone.rows) as row_label
      cross join generate_series(1, v_zone.seats_per_row) as number
      on conflict (venue_zone_id, row_label, number) do nothing;
    end if;
    v_zone_id := null;
  end loop;
end;
$$;

-- ── zone management ─────────────────────────────────────────────────────────
create or replace function public.admin_save_venue_zone(
  p_zone_id text,
  p_venue_id text,
  p_patch jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_zone public.venue_zones%rowtype;
  v_name text := nullif(trim(p_patch ->> 'name'), '');
  v_rows text[];
  v_seats_per_row integer := (p_patch ->> 'seatsPerRow')::integer;
  v_price integer := (p_patch ->> 'defaultPriceMinorUnits')::integer;
  v_row text;
  v_number integer;
begin
  if not public.is_admin() then
    raise exception 'Admin only' using errcode = '42501';
  end if;
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then
    raise exception 'Patch must be a JSON object' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.venues
    where id = p_venue_id and tenant_id = public.current_tenant()
  ) then
    raise exception 'Venue not found' using errcode = 'P0002';
  end if;

  if p_zone_id is null or p_zone_id = '' then
    if v_name is null then
      raise exception 'A zone needs a name' using errcode = '22023';
    end if;
    v_rows := array(
      select jsonb_array_elements_text(coalesce(p_patch -> 'rows', '[]'::jsonb))
    );
    if coalesce(array_length(v_rows, 1), 0) = 0 then
      raise exception 'A zone needs at least one row' using errcode = '22023';
    end if;
    if v_seats_per_row is null or v_seats_per_row < 1 then
      raise exception 'Seats per row must be at least 1' using errcode = '22023';
    end if;
    if v_price is null or v_price < 0 then
      raise exception 'A zone needs a non-negative default price' using errcode = '22023';
    end if;

    insert into public.venue_zones (
      tenant_id, venue_id, name, description, color, rows, seats_per_row,
      default_price_minor_units
    )
    values (
      public.current_tenant(), p_venue_id, v_name,
      coalesce(p_patch ->> 'description', ''),
      coalesce(nullif(p_patch ->> 'color', ''), '#22C55E'),
      v_rows, v_seats_per_row, v_price
    )
    returning * into v_zone;

    foreach v_row in array v_rows loop
      for v_number in 1..v_seats_per_row loop
        insert into public.venue_seats (tenant_id, venue_zone_id, row_label, number)
        values (v_zone.tenant_id, v_zone.id, v_row, v_number);
      end loop;
    end loop;
  elsif p_zone_id <> '' then
    select * into v_zone
      from public.venue_zones
      where id = p_zone_id
        and venue_id = p_venue_id
        and tenant_id = public.current_tenant()
      for update;
    if not found then
      raise exception 'Venue zone not found' using errcode = 'P0002';
    end if;

    update public.venue_zones
      set name = coalesce(v_name, name),
          description = coalesce(p_patch ->> 'description', description),
          color = coalesce(nullif(p_patch ->> 'color', ''), color),
          default_price_minor_units = coalesce(v_price, default_price_minor_units)
      where id = p_zone_id
      returning * into v_zone;
  end if;

  insert into public.audit_logs (actor_id, action, entity, entity_id, metadata)
  values (
    auth.uid(),
    case when p_zone_id is null or p_zone_id = '' then 'venue.zone.create' else 'venue.zone.update' end,
    'venue_zones',
    v_zone.id,
    jsonb_build_object('venue_id', p_venue_id, 'name', v_zone.name)
  );

  return jsonb_build_object(
    'row', to_jsonb(v_zone),
    'capacity', (select count(*) from public.venue_seats where venue_zone_id = v_zone.id)
  );
end;
$$;

create or replace function public.admin_delete_venue_zone(p_zone_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_zone public.venue_zones%rowtype;
begin
  if not public.is_admin() then
    raise exception 'Admin only' using errcode = '42501';
  end if;
  delete from public.venue_zones
    where id = p_zone_id and tenant_id = public.current_tenant()
    returning * into v_zone;
  if not found then
    raise exception 'Venue zone not found' using errcode = 'P0002';
  end if;
  insert into public.audit_logs (actor_id, action, entity, entity_id, metadata)
  values (auth.uid(), 'venue.zone.delete', 'venue_zones', v_zone.id,
          jsonb_build_object('venue_id', v_zone.venue_id, 'name', v_zone.name));
end;
$$;

-- ── fixture creation from the ground ────────────────────────────────────────
create or replace function public.admin_create_match_from_venue(
  p_match jsonb,
  p_gate_ids text[] default null,
  p_prices jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_match public.matches%rowtype;
  v_venue public.venues%rowtype;
  v_zone public.venue_zones%rowtype;
  v_zone_id text;
  v_kickoff timestamptz;
  v_price integer;
  v_gate text;
  v_gate_ids text[];
  v_home_away text := coalesce(p_match ->> 'homeAway', 'home');
begin
  if not public.is_admin() then
    raise exception 'Admin only' using errcode = '42501';
  end if;

  select * into v_venue
    from public.venues
    where id = (p_match ->> 'venueId')
      and tenant_id = public.current_tenant();
  if not found then
    raise exception 'Venue not found' using errcode = 'P0002';
  end if;

  v_kickoff := (p_match ->> 'kickoffAt')::timestamptz;
  if v_kickoff is null or v_kickoff <= now() then
    raise exception 'A fixture kickoff must be in the future' using errcode = 'P0001';
  end if;
  if nullif(trim(p_match ->> 'opponent'), '') is null
     or nullif(trim(p_match ->> 'opponentShort'), '') is null then
    raise exception 'Opponent and short code are required' using errcode = '22023';
  end if;
  if v_home_away not in ('home', 'away') then
    raise exception 'Home/away must be home or away' using errcode = '22023';
  end if;
  if not exists (select 1 from public.venue_zones where venue_id = v_venue.id) then
    raise exception 'Add at least one zone to the venue first' using errcode = 'P0001';
  end if;

  insert into public.matches (
    tenant_id, opponent, opponent_short, kickoff_at, venue_id, competition,
    home_away, poster_colors, accent
  )
  values (
    v_venue.tenant_id,
    trim(p_match ->> 'opponent'),
    trim(p_match ->> 'opponentShort'),
    v_kickoff,
    v_venue.id,
    coalesce(nullif(trim(p_match ->> 'competition'), ''), 'Thai Premier League'),
    v_home_away,
    case
      when jsonb_typeof(p_match -> 'posterColors') = 'array'
       and jsonb_array_length(p_match -> 'posterColors') = 2
      then array(select jsonb_array_elements_text(p_match -> 'posterColors'))
      else array['#0B6B3A', '#052E1A']::text[]
    end,
    coalesce(nullif(p_match ->> 'accent', ''), '#F4C430')
  )
  returning * into v_match;

  for v_zone in
    select * from public.venue_zones where venue_id = v_venue.id order by name
  loop
    insert into public.zones (
      match_id, name, description, color, rows, seats_per_row
    )
    values (
      v_match.id, v_zone.name, v_zone.description, v_zone.color,
      v_zone.rows, v_zone.seats_per_row
    )
    returning id into v_zone_id;

    insert into public.seats (zone_id, row_label, number)
    select v_zone_id, row_label, number
    from public.venue_seats
    where venue_zone_id = v_zone.id;

    v_price := coalesce((p_prices ->> v_zone.id)::integer, v_zone.default_price_minor_units);
    if v_price is null or v_price < 0 then
      raise exception 'A venue zone needs a price' using errcode = '22023';
    end if;

    insert into public.match_zone_prices (match_id, zone_id, price_minor_units)
    values (v_match.id, v_zone_id, v_price);
  end loop;

  if p_gate_ids is null then
    select coalesce(array_agg(id), array[]::text[]) into v_gate_ids
      from public.gates
      where venue_id = v_venue.id and active;
  else
    v_gate_ids := p_gate_ids;
  end if;

  foreach v_gate in array v_gate_ids loop
    if not exists (
      select 1 from public.gates
      where id = v_gate and venue_id = v_venue.id and active
    ) then
      raise exception 'Gate % does not belong to this venue', v_gate using errcode = '22023';
    end if;
    insert into public.match_gates (match_id, gate_id)
    values (v_match.id, v_gate)
    on conflict do nothing;
  end loop;

  insert into public.audit_logs (actor_id, action, entity, entity_id, metadata)
  values (
    auth.uid(), 'match.create', 'matches', v_match.id,
    jsonb_build_object(
      'opponent', v_match.opponent,
      'venue_id', v_venue.id,
      'gate_ids', to_jsonb(v_gate_ids)
    )
  );

  return jsonb_build_object(
    'row', to_jsonb(v_match),
    'venue_name', v_venue.name
  );
end;
$$;

revoke execute on function public.admin_save_venue_zone(text, text, jsonb)
  from public, anon;
revoke execute on function public.admin_delete_venue_zone(text)
  from public, anon;
revoke execute on function public.admin_create_match_from_venue(jsonb, text[], jsonb)
  from public, anon;

grant execute on function public.admin_save_venue_zone(text, text, jsonb) to authenticated;
grant execute on function public.admin_delete_venue_zone(text) to authenticated;
grant execute on function public.admin_create_match_from_venue(jsonb, text[], jsonb) to authenticated;
