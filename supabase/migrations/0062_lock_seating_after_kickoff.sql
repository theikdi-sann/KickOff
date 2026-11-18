-- 0062 — seating inventory locks at kickoff.
--
-- A zone, a price and a seat are saleable inventory. Once a fixture has
-- kicked off (or the clock has closed it), changing that inventory can only
-- corrupt what the club already sold: the console must edit the next fixture,
-- not rewrite a played one.
--
-- The guard applies to admin requests only. Seeds, fixtures and migrations run
-- as the database owner and have no `authenticated` role, so historical data
-- can still be built and repaired.
create or replace function public.assert_seating_open(p_match_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kickoff timestamptz;
  v_status public.match_status;
begin
  if auth.role() is distinct from 'authenticated' then
    return;
  end if;

  select kickoff_at, status
    into v_kickoff, v_status
    from public.matches
    where id = p_match_id;

  -- An unknown fixture is the foreign key's problem, not the clock's.
  if not found then
    return;
  end if;

  if v_kickoff <= now()
     or v_status in ('live', 'completed', 'cancelled') then
    raise exception 'Seating is locked after kickoff' using errcode = 'P0001';
  end if;
end;
$$;

revoke execute on function public.assert_seating_open(text)
  from public, anon, authenticated;

create or replace function public.assert_seating_open_for_zone(p_zone_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_match_id text;
begin
  select match_id into v_match_id from public.zones where id = p_zone_id;
  if v_match_id is not null then
    perform public.assert_seating_open(v_match_id);
  end if;
end;
$$;

revoke execute on function public.assert_seating_open_for_zone(text)
  from public, anon, authenticated;

-- ── zones ───────────────────────────────────────────────────────────────────
create or replace function public.zones_assert_seating_open()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.assert_seating_open(
    case when tg_op = 'DELETE' then old.match_id else new.match_id end
  );
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists zones_assert_seating_open on public.zones;
create trigger zones_assert_seating_open
before insert or update or delete on public.zones
for each row execute function public.zones_assert_seating_open();

-- ── prices ──────────────────────────────────────────────────────────────────
create or replace function public.match_zone_prices_assert_seating_open()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.assert_seating_open(
    case when tg_op = 'DELETE' then old.match_id else new.match_id end
  );
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists match_zone_prices_assert_seating_open on public.match_zone_prices;
create trigger match_zone_prices_assert_seating_open
before insert or update or delete on public.match_zone_prices
for each row execute function public.match_zone_prices_assert_seating_open();

-- ── seats (the match lives on the parent zone) ──────────────────────────────
create or replace function public.seats_assert_seating_open()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.assert_seating_open_for_zone(
    case when tg_op = 'DELETE' then old.zone_id else new.zone_id end
  );
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists seats_assert_seating_open on public.seats;
create trigger seats_assert_seating_open
before insert or update or delete on public.seats
for each row execute function public.seats_assert_seating_open();
