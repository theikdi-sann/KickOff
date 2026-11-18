-- 0059 — the result is an admin action, and it closes the row.
--
-- The match clock (0058) flips a played fixture to `completed` but never
-- writes a score. This RPC writes both scores and the status in one
-- transaction, so the stored row stops contradicting the clock and the fan
-- Results list (which only shows completed rows with a score) stays honest.
create or replace function public.admin_set_match_result(
  p_match_id text,
  p_home_score integer,
  p_away_score integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_before public.matches%rowtype;
  v_after public.matches%rowtype;
begin
  if not public.is_admin() then
    raise exception 'Admin only' using errcode = '42501';
  end if;

  if p_home_score is null or p_away_score is null
     or p_home_score < 0 or p_away_score < 0 then
    raise exception 'Scores must be non-negative integers' using errcode = '22023';
  end if;

  select * into v_before
    from public.matches
    where id = p_match_id
      and tenant_id = public.current_tenant()
    for update;
  if not found then
    raise exception 'Fixture not found' using errcode = 'P0002';
  end if;

  if v_before.status in ('postponed', 'cancelled') then
    raise exception 'A % fixture has no result', v_before.status
      using errcode = 'P0001';
  end if;

  -- A result for a match that has not kicked off would close a future
  -- fixture. The console never offers it; the database refuses it too.
  if v_before.kickoff_at > now() then
    raise exception 'The match has not started' using errcode = 'P0001';
  end if;

  update public.matches
    set home_score = p_home_score,
        away_score = p_away_score,
        status = 'completed',
        updated_at = now()
    where id = p_match_id
    returning * into v_after;

  insert into public.audit_logs (actor_id, action, entity, entity_id, metadata)
  values (
    auth.uid(),
    'match_result',
    'match',
    p_match_id,
    jsonb_build_object(
      'home_score', p_home_score,
      'away_score', p_away_score,
      'from_status', v_before.status,
      'from_home_score', v_before.home_score,
      'from_away_score', v_before.away_score
    )
  );

  return jsonb_build_object('row', to_jsonb(v_after));
end;
$$;

revoke execute on function public.admin_set_match_result(text, integer, integer)
  from public, anon;
grant execute on function public.admin_set_match_result(text, integer, integer)
  to authenticated;
