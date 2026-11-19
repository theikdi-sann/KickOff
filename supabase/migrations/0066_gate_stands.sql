-- 0066 — a turnstile serves one stand of one ground.
--
-- 0044 made a gate physical: it belongs to a venue, and `match_gates` joins it
-- to the fixtures it admits. That still allowed a gate to admit any stand of
-- its ground, and — worse — an assignment could pair a gate with a fixture at
-- a *different* ground.
--
-- A stand is the unit of admission now:
--
--   * `gates.venue_zone_id` names the stand the turnstile serves (NULL means
--     the whole ground);
--   * `zones.venue_zone_id` remembers which venue zone a fixture zone was
--     cloned from, so the scanner can compare the pass's stand with the
--     gate's;
--   * a scan for the wrong stand returns `wrong_zone` and leaves the pass
--     valid, so the fan can walk to the right gate and be admitted there;
--   * a gate may only serve a stand of its own venue, and a gate may only be
--     assigned to a fixture at its own venue (same club).
--
-- The composite foreign keys carry the tenant with the id, as the rest of the
-- series does, so a cross-club reference cannot be stored at all.

-- ── fixture zones remember their venue zone ─────────────────────────────────
alter table public.zones add column if not exists venue_zone_id text;

alter table public.zones drop constraint if exists zones_venue_zone_fkey;
alter table public.zones add constraint zones_venue_zone_fkey
  foreign key (venue_zone_id, tenant_id)
  references public.venue_zones (id, tenant_id)
  on delete set null (venue_zone_id) not valid;
alter table public.zones validate constraint zones_venue_zone_fkey;

create index if not exists zones_venue_zone_idx on public.zones (venue_zone_id);

-- Backfill the clones that already exist: a fixture zone with the same name as
-- a venue zone at the fixture's own ground came from it.
update public.zones z
   set venue_zone_id = vz.id
  from public.matches m
  join public.venue_zones vz on vz.venue_id = m.venue_id
 where z.match_id = m.id
   and z.tenant_id = vz.tenant_id
   and z.venue_zone_id is null
   and z.name = vz.name;

-- ── a gate names the stand it serves ────────────────────────────────────────
alter table public.gates add column if not exists venue_zone_id text;

alter table public.gates drop constraint if exists gates_venue_zone_fkey;
alter table public.gates add constraint gates_venue_zone_fkey
  foreign key (venue_zone_id, tenant_id)
  references public.venue_zones (id, tenant_id)
  on delete set null (venue_zone_id) not valid;
alter table public.gates validate constraint gates_venue_zone_fkey;

create index if not exists gates_venue_zone_idx on public.gates (venue_zone_id);

-- The stand must belong to the gate's own ground. The composite FK already
-- pins the club; this pins the venue, which the FK cannot express because
-- `venue_zones` is keyed by `(venue_id, name)` and `(id, tenant_id)`.
create or replace function public.enforce_gate_stand()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.venue_zone_id is not null then
    if not exists (
      select 1
        from public.venue_zones vz
       where vz.id = new.venue_zone_id
         and vz.tenant_id = new.tenant_id
         and vz.venue_id = new.venue_id
    ) then
      raise exception 'A gate can only serve a stand of its own venue'
        using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists gates_enforce_stand on public.gates;
create trigger gates_enforce_stand
before insert or update of venue_id, venue_zone_id, tenant_id on public.gates
for each row execute function public.enforce_gate_stand();

-- ── an assignment cannot cross grounds ──────────────────────────────────────
-- Refuse to install the rule over data that already breaks it, with a message
-- an operator can act on rather than a bare constraint failure.
do $$
declare
  v_bad integer;
begin
  select count(*) into v_bad
    from public.match_gates mg
    join public.matches m on m.id = mg.match_id and m.tenant_id = mg.tenant_id
    join public.gates g on g.id = mg.gate_id and g.tenant_id = mg.tenant_id
   where m.venue_id is distinct from g.venue_id;
  if v_bad > 0 then
    raise exception
      '% gate assignment(s) pair a gate with a fixture at another venue; fix them before 0066',
      v_bad using errcode = '23514';
  end if;
end $$;

create or replace function public.enforce_gate_venue()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_match_venue text;
  v_match_tenant uuid;
  v_gate_venue text;
  v_gate_tenant uuid;
begin
  select m.venue_id, m.tenant_id into v_match_venue, v_match_tenant
    from public.matches m where m.id = new.match_id;
  select g.venue_id, g.tenant_id into v_gate_venue, v_gate_tenant
    from public.gates g where g.id = new.gate_id;

  -- A missing row or a cross-club pair is the composite foreign key's job;
  -- returning here keeps the established `23503` for those cases. This
  -- trigger adds only the rule the keys cannot express: one ground.
  if v_match_venue is null or v_gate_venue is null
     or v_match_tenant is distinct from v_gate_tenant then
    return new;
  end if;
  if v_match_venue is distinct from v_gate_venue then
    raise exception 'A gate can only admit fixtures at its own venue'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists match_gates_enforce_venue on public.match_gates;
create trigger match_gates_enforce_venue
before insert or update of match_id, gate_id, tenant_id on public.match_gates
for each row execute function public.enforce_gate_venue();

-- ── the clone records where each zone came from ─────────────────────────────
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
      tenant_id, match_id, name, description, color, rows, seats_per_row,
      venue_zone_id
    )
    values (
      v_match.tenant_id, v_match.id, v_zone.name, v_zone.description,
      v_zone.color, v_zone.rows, v_zone.seats_per_row, v_zone.id
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
    insert into public.match_gates (match_id, gate_id, tenant_id)
    values (v_match.id, v_gate, v_match.tenant_id)
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

revoke execute on function public.admin_create_match_from_venue(jsonb, text[], jsonb)
  from public, anon;
grant execute on function public.admin_create_match_from_venue(jsonb, text[], jsonb)
  to authenticated;

-- ── the scan compares the ticket's stand with the gate's ────────────────────
create or replace function public.scan_ticket(
  p_ticket_id text,
  p_gate_id text,
  p_admin_id uuid,
  p_idempotency_key text,
  p_raw_hash text default null,
  p_invalid_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_gate public.gates%rowtype;
  v_ticket public.tickets%rowtype;
  v_match public.matches%rowtype;
  v_ticket_zone text;
  v_existing public.scan_events%rowtype;
  v_operator uuid;
  v_event_id text;
  v_key text := coalesce(nullif(p_idempotency_key, ''), replace(gen_random_uuid()::text, '-', ''));
  v_hash text := coalesce(nullif(p_raw_hash, ''), encode(digest(coalesce(p_ticket_id, ''), 'sha256'), 'hex'));
  v_result public.scan_result;
  v_message text;
begin
  if not public.is_gate_operator() then
    raise exception 'Staff only' using errcode = '42501';
  end if;
  if auth.uid() is not null and p_admin_id <> auth.uid() then
    raise exception 'Scan owner mismatch' using errcode = '42501';
  end if;

  -- Idempotency replay: the same key always returns the original outcome.
  select * into v_existing from public.scan_events where idempotency_key = v_key;
  if v_existing.id is not null then
    return jsonb_build_object(
      'code', v_existing.result,
      'scanEventId', v_existing.id,
      'ticketId', v_existing.ticket_id,
      'replayed', true
    );
  end if;

  select * into v_gate from public.gates where id = p_gate_id;
  if v_gate.id is null then
    raise exception 'Gate not found' using errcode = 'P0002';
  end if;
  if v_gate.tenant_id is distinct from public.current_tenant() then
    raise exception 'Staff only' using errcode = '42501';
  end if;
  if not v_gate.active then
    raise exception 'Gate is inactive' using errcode = 'P0001';
  end if;
  if not exists (
    select 1 from public.match_gates mg where mg.gate_id = v_gate.id
  ) then
    raise exception 'Gate has no fixture assigned' using errcode = 'P0001';
  end if;

  select t.* into v_ticket from public.tickets t where t.id = p_ticket_id for update;
  select m.* into v_match from public.matches m where m.id = v_ticket.match_id;

  -- The stand a pass belongs to: the fixture zone the seat sits in, mapped
  -- back to the venue zone it was cloned from.
  select z.venue_zone_id into v_ticket_zone
    from public.seats s
    join public.zones z on z.id = s.zone_id
   where s.id = v_ticket.seat_id;

  if v_ticket.id is null then
    v_result := 'invalid';
    v_message := 'Ticket not found';
  elsif p_invalid_reason is not null then
    -- The Edge Function rejected the signature/nonce before we got here.
    v_result := 'invalid';
    v_message := p_invalid_reason;
  elsif not exists (
    select 1 from public.match_gates mg
     where mg.gate_id = v_gate.id and mg.match_id = v_ticket.match_id
  ) then
    v_result := 'wrong_match';
    v_message := 'This pass is for a different fixture';
  elsif v_ticket.status = 'void' then
    v_result := 'invalid';
    v_message := 'This pass has been voided';
  elsif v_match.id is null or v_match.status = 'completed' then
    v_result := 'invalid';
    v_message := 'This fixture has ended';
  elsif now() < v_match.kickoff_at - interval '2 hours' then
    v_result := 'invalid';
    v_message := 'The gates are not open yet';
  elsif now() > v_match.kickoff_at + interval '2 hours' then
    v_result := 'invalid';
    v_message := 'The gate window has closed';
  elsif v_ticket.status = 'used' then
    v_result := 'used';
    v_message := 'This pass has already been scanned';
  elsif v_gate.venue_zone_id is not null
        and v_ticket_zone is not null
        and v_ticket_zone <> v_gate.venue_zone_id then
    v_result := 'wrong_zone';
    v_message := 'This pass is for a different stand';
  else
    v_result := 'valid';
    v_message := 'Welcome in';
  end if;

  if v_result = 'valid' then
    update public.tickets
    set status = 'used', used_at = now()
    where id = v_ticket.id;
  end if;

  -- The account is global; its authority at this club is a membership row.
  -- is_gate_operator() already required one, so every scan that reaches
  -- here records its operator; `admin_id` keeps the accountable identity.
  select sm.id into v_operator
    from public.staff_members sm
   where sm.id = p_admin_id
     and sm.tenant_id = v_gate.tenant_id;

  insert into public.scan_events
    (ticket_id, raw_hash, result, gate_id, admin_id, idempotency_key,
     match_id, operator_id, tenant_id)
  values
    (v_ticket.id, v_hash, v_result, p_gate_id, p_admin_id, v_key,
     v_ticket.match_id, v_operator, v_gate.tenant_id)
  returning id into v_event_id;

  return jsonb_build_object(
    'code', v_result,
    'scanEventId', v_event_id,
    'ticketId', v_ticket.id,
    'message', v_message,
    'replayed', false
  );
exception
  when unique_violation then
    -- Two concurrent attempts shared an idempotency key: return the winner.
    select * into v_existing from public.scan_events where idempotency_key = v_key;
    if v_existing.id is null then
      raise;
    end if;
    return jsonb_build_object(
      'code', v_existing.result,
      'scanEventId', v_existing.id,
      'ticketId', v_existing.ticket_id,
      'replayed', true
    );
end;
$$;

notify pgrst, 'reload schema';
