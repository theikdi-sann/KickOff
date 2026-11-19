-- 0067 — one call builds the fixture and the ground it needs.
--
-- The fixture dialog must be self-sufficient: an admin can name a new ground,
-- add its stands (with seats generated from rows × seats-per-row), add the
-- turnstiles that serve those stands, and create the fixture — without
-- leaving the dialog and without ever leaving a half-built venue behind.
--
-- `admin_create_match_full()` is deliberately one transaction:
--
--   * `p_venue` is either `{"id": ...}` for an existing ground or the fields
--     of a new one (`name`, `city`, `address`, `isHome`);
--   * `p_zones` adds venue zones (each with rows and seats-per-row) before
--     anything is cloned; an existing venue keeps the zones it already has;
--   * `p_gates` creates venue-level turnstiles, and a gate may name a stand
--     created in the same call by its draft `key`;
--   * `p_gate_ids` is the explicit set of existing gates to admit (NULL means
--     every active gate at the ground); newly created gates are always
--     admitted as well;
--   * `p_prices` overrides the per-fixture price by venue-zone id; a new zone
--     falls back to its own default.
--
-- A second home venue is refused with a readable `22023`: the home ground is
-- managed on the Venues screen and the partial unique index is the backstop.

create or replace function public.admin_create_match_full(
  p_match jsonb,
  p_venue jsonb,
  p_zones jsonb default '[]'::jsonb,
  p_gates jsonb default '[]'::jsonb,
  p_gate_ids text[] default null,
  p_prices jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant uuid := public.current_tenant();
  v_match public.matches%rowtype;
  v_venue public.venues%rowtype;
  v_zone public.venue_zones%rowtype;
  v_zone_json jsonb;
  v_gate_json jsonb;
  v_zone_id text;
  v_gate_id text;
  v_gate_zone text;
  v_key_map jsonb := '{}'::jsonb;
  v_created_gate_ids text[] := '{}'::text[];
  v_gate_ids text[];
  v_kickoff timestamptz;
  v_price integer;
  v_gate text;
  v_home_away text := coalesce(nullif(trim(p_match ->> 'homeAway'), ''), 'home');
  v_creating boolean;
begin
  if not public.is_admin() then
    raise exception 'Admin only' using errcode = '42501';
  end if;
  if p_match is null or jsonb_typeof(p_match) <> 'object' then
    raise exception 'The fixture must be a JSON object' using errcode = '22023';
  end if;
  if p_venue is null or jsonb_typeof(p_venue) <> 'object' then
    raise exception 'The venue must be a JSON object' using errcode = '22023';
  end if;
  if p_zones is null or jsonb_typeof(p_zones) <> 'array' then
    raise exception 'Zones must be a JSON array' using errcode = '22023';
  end if;
  if p_gates is null or jsonb_typeof(p_gates) <> 'array' then
    raise exception 'Gates must be a JSON array' using errcode = '22023';
  end if;

  v_creating := nullif(trim(p_venue ->> 'id'), '') is null;

  if v_creating then
    if jsonb_array_length(p_zones) = 0 then
      raise exception 'Add at least one zone to the venue' using errcode = '22023';
    end if;
    if coalesce((p_venue ->> 'isHome')::boolean, false)
       and exists (
         select 1 from public.venues
          where tenant_id = v_tenant and is_home
       ) then
      raise exception 'This club already has a home venue; manage it on the Venues page'
        using errcode = '22023';
    end if;

    insert into public.venues (tenant_id, name, city, address, is_home)
    values (
      v_tenant,
      trim(p_venue ->> 'name'),
      nullif(trim(p_venue ->> 'city'), ''),
      nullif(trim(p_venue ->> 'address'), ''),
      coalesce((p_venue ->> 'isHome')::boolean, false)
    )
    returning * into v_venue;
  else
    select * into v_venue
      from public.venues
      where id = trim(p_venue ->> 'id')
        and tenant_id = v_tenant;
    if not found then
      raise exception 'Venue not found' using errcode = 'P0002';
    end if;
  end if;

  -- New stands are physical: generate the seats now, then clone them into the
  -- fixture below. The draft `key` is only a handle for gates in this call.
  for v_zone_json in select value from jsonb_array_elements(p_zones) loop
    insert into public.venue_zones (
      tenant_id, venue_id, name, description, color, rows, seats_per_row,
      default_price_minor_units
    )
    values (
      v_tenant,
      v_venue.id,
      trim(v_zone_json ->> 'name'),
      coalesce(v_zone_json ->> 'description', ''),
      coalesce(nullif(v_zone_json ->> 'color', ''), '#22C55E'),
      array(select jsonb_array_elements_text(coalesce(v_zone_json -> 'rows', '[]'::jsonb))),
      (v_zone_json ->> 'seatsPerRow')::integer,
      (v_zone_json ->> 'defaultPriceMinorUnits')::integer
    )
    returning * into v_zone;

    insert into public.venue_seats (tenant_id, venue_zone_id, row_label, number)
    select v_tenant, v_zone.id, row_label, number
      from unnest(v_zone.rows) as row_label
      cross join generate_series(1, v_zone.seats_per_row) as number;

    if nullif(trim(v_zone_json ->> 'key'), '') is not null then
      v_key_map := v_key_map
        || jsonb_build_object(trim(v_zone_json ->> 'key'), v_zone.id);
    end if;
  end loop;

  if not exists (select 1 from public.venue_zones where venue_id = v_venue.id) then
    raise exception 'Add at least one zone to the venue' using errcode = '22023';
  end if;

  -- Inline turnstiles are permanent venue-level gates (they appear on the
  -- Gates page and outlive the fixture), so they are inserted before the
  -- assignment list is resolved.
  for v_gate_json in select value from jsonb_array_elements(p_gates) loop
    v_gate_id := trim(v_gate_json ->> 'id');
    if nullif(v_gate_id, '') is null then
      raise exception 'A gate needs a code' using errcode = '22023';
    end if;

    v_gate_zone := nullif(trim(v_gate_json ->> 'zoneId'), '');
    if v_gate_zone is null and nullif(trim(v_gate_json ->> 'zoneKey'), '') is not null then
      v_gate_zone := v_key_map ->> trim(v_gate_json ->> 'zoneKey');
      if v_gate_zone is null then
        raise exception 'Gate % names a stand that is not in this call', v_gate_id
          using errcode = '22023';
      end if;
    end if;
    if v_gate_zone is not null and not exists (
      select 1 from public.venue_zones
       where id = v_gate_zone and venue_id = v_venue.id and tenant_id = v_tenant
    ) then
      raise exception 'Gate % names a stand that is not at this venue', v_gate_id
        using errcode = '22023';
    end if;

    insert into public.gates (
      id, tenant_id, name, venue_id, venue_zone_id, active
    )
    values (
      v_gate_id,
      v_tenant,
      trim(v_gate_json ->> 'name'),
      v_venue.id,
      v_gate_zone,
      coalesce((v_gate_json ->> 'active')::boolean, true)
    );
    v_created_gate_ids := array_append(v_created_gate_ids, v_gate_id);
  end loop;

  -- The match is validated before anything is cloned, but after the ground is
  -- built: a bad kickoff still rolls the whole call back.
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

  insert into public.matches (
    tenant_id, opponent, opponent_short, kickoff_at, venue_id, competition,
    home_away, poster_colors, accent
  )
  values (
    v_tenant,
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
      tenant_id, match_id, name, description, color, rows, seats_per_row,
      venue_zone_id
    )
    values (
      v_tenant, v_match.id, v_zone.name, v_zone.description, v_zone.color,
      v_zone.rows, v_zone.seats_per_row, v_zone.id
    )
    returning id into v_zone_id;

    insert into public.seats (tenant_id, zone_id, row_label, number)
    select v_tenant, v_zone_id, row_label, number
      from public.venue_seats
     where venue_zone_id = v_zone.id;

    v_price := coalesce(
      (p_prices ->> v_zone.id)::integer,
      v_zone.default_price_minor_units
    );
    if v_price is null or v_price < 0 then
      raise exception 'A venue zone needs a price' using errcode = '22023';
    end if;

    insert into public.match_zone_prices (
      tenant_id, match_id, zone_id, price_minor_units
    )
    values (v_tenant, v_match.id, v_zone_id, v_price);
  end loop;

  if p_gate_ids is null then
    select coalesce(array_agg(id), array[]::text[]) into v_gate_ids
      from public.gates
     where venue_id = v_venue.id and active and tenant_id = v_tenant;
  else
    select coalesce(array_agg(distinct id), array[]::text[]) into v_gate_ids
      from unnest(p_gate_ids || v_created_gate_ids) as id;
  end if;

  foreach v_gate in array v_gate_ids loop
    if not exists (
      select 1 from public.gates
       where id = v_gate and venue_id = v_venue.id and active and tenant_id = v_tenant
    ) then
      raise exception 'Gate % does not belong to this venue', v_gate
        using errcode = '22023';
    end if;
    insert into public.match_gates (match_id, gate_id, tenant_id)
    values (v_match.id, v_gate, v_tenant)
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
    'venue_name', v_venue.name,
    'gate_ids', to_jsonb(v_gate_ids)
  );
end;
$$;

revoke execute on function public.admin_create_match_full(jsonb, jsonb, jsonb, jsonb, text[], jsonb)
  from public, anon;
grant execute on function public.admin_create_match_full(jsonb, jsonb, jsonb, jsonb, text[], jsonb)
  to authenticated;

notify pgrst, 'reload schema';
