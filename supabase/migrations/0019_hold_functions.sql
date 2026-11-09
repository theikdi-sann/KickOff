-- 0019_hold_functions — atomic seat holds.
create or replace function public.create_hold(p_match_id text, p_seat_ids text[])
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_count integer := coalesce(array_length(p_seat_ids, 1), 0);
  v_group text := 'h_' || replace(gen_random_uuid()::text, '-', '');
  v_expires timestamptz := now() + interval '600 seconds';
  v_kickoff timestamptz;
  v_bad integer;
begin
  if v_user is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if v_count = 0 then
    raise exception 'Select at least one seat' using errcode = '22023';
  end if;
  if v_count > 8 then
    raise exception 'At most 8 seats per order' using errcode = '22023';
  end if;
  if (select count(distinct s) from unnest(p_seat_ids) as s) <> v_count then
    raise exception 'Duplicate seat ids' using errcode = '22023';
  end if;

  select kickoff_at into v_kickoff from public.matches where id = p_match_id;
  if v_kickoff is null then
    raise exception 'Match not found' using errcode = 'P0002';
  end if;
  if v_kickoff <= now() + interval '15 minutes' then
    raise exception 'Sales are closed for this match' using errcode = 'P0001';
  end if;

  -- Free expired holds for these seats before attempting the insert.
  update public.seat_holds
  set released_at = now()
  where seat_id = any (p_seat_ids)
    and released_at is null
    and expires_at <= now();

  select count(*) into v_bad
  from unnest(p_seat_ids) as sid
  where not exists (
    select 1
    from public.seats s
    join public.zones z on z.id = s.zone_id
    where s.id = sid
      and z.match_id = p_match_id
      and s.status = 'available'
  );
  if v_bad > 0 then
    raise exception 'One or more seats are unavailable' using errcode = '23505';
  end if;

  begin
    insert into public.seat_holds (hold_group_id, seat_id, user_id, expires_at)
    select v_group, sid, v_user, v_expires from unnest(p_seat_ids) as sid;
  exception
    when unique_violation then
      raise exception 'Seats already held' using errcode = '23505';
  end;

  return jsonb_build_object(
    'id', v_group,
    'matchId', p_match_id,
    'seatIds', to_jsonb(p_seat_ids),
    'expiresAt', v_expires
  );
end;
$$;

create or replace function public.release_hold(p_hold_id text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_count integer;
begin
  if v_user is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  update public.seat_holds
  set released_at = now()
  where hold_group_id = p_hold_id
    and user_id = v_user
    and released_at is null;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

grant execute on function public.create_hold(text, text[]) to authenticated;
grant execute on function public.release_hold(text) to authenticated;
