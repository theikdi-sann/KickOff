-- 0057 — admin_set_match_status: postpone, cancel, restore.
--
-- The match clock (0058) owns `live` and `completed`; an admin owns the two
-- exceptional states and their reversal. Every transition is audited, and a
-- postponement or cancellation must carry a reason. Nothing here moves money:
-- cancellation surfaces paid orders for the existing refund flow.
create or replace function public.admin_set_match_status(
  p_match_id text,
  p_status public.match_status,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_before public.matches%rowtype;
  v_after public.matches%rowtype;
  v_reason text := nullif(trim(p_reason), '');
begin
  if not public.is_admin() then
    raise exception 'Admin only' using errcode = '42501';
  end if;

  if p_status not in ('upcoming', 'postponed', 'cancelled') then
    raise exception 'The clock owns live and completed'
      using errcode = 'P0001';
  end if;

  select * into v_before
    from public.matches
    where id = p_match_id
      and tenant_id = public.current_tenant()
    for update;
  if not found then
    raise exception 'Fixture not found' using errcode = 'P0002';
  end if;

  if v_before.status in ('live', 'completed') then
    raise exception 'The clock owns a started match'
      using errcode = 'P0001';
  end if;

  if p_status = v_before.status then
    return jsonb_build_object('row', to_jsonb(v_before));
  end if;

  -- A postponement or cancellation is an explanation, not a toggle; undoing a
  -- cancellation is equally consequential and keeps the same requirement.
  if v_reason is null
     and (p_status in ('postponed', 'cancelled') or v_before.status = 'cancelled') then
    raise exception 'A reason is required' using errcode = 'P0001';
  end if;

  update public.matches
    set status = p_status,
        updated_at = now()
    where id = p_match_id
    returning * into v_after;

  -- A cancelled fixture must not admit anyone at the gate. The ticket is
  -- voided here; the money (if any) is refunded by the existing orders flow,
  -- never automatically.
  if p_status = 'cancelled' then
    update public.tickets
      set status = 'void'
      where match_id = p_match_id
        and status = 'valid';
  end if;

  insert into public.audit_logs (actor_id, action, entity, entity_id, metadata)
  values (
    auth.uid(),
    'match_status',
    'match',
    p_match_id,
    jsonb_build_object(
      'from', v_before.status,
      'to', v_after.status,
      'reason', v_reason
    )
  );

  return jsonb_build_object('row', to_jsonb(v_after));
end;
$$;

revoke execute on function public.admin_set_match_status(text, public.match_status, text)
  from public, anon;
grant execute on function public.admin_set_match_status(text, public.match_status, text)
  to authenticated;
