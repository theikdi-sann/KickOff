-- 0021_scan_functions — atomic gate scan + 60s undo.
create or replace function public.scan_ticket(
  p_ticket_id text,
  p_gate_id text,
  p_admin_id uuid,
  p_idempotency_key text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status public.ticket_status;
  v_event_id text;
  v_key text := coalesce(p_idempotency_key, replace(gen_random_uuid()::text, '-', ''));
  v_existing public.scan_events%rowtype;
begin
  if not public.is_admin() then
    raise exception 'Admin only' using errcode = '42501';
  end if;

  select * into v_existing from public.scan_events where idempotency_key = v_key;
  if v_existing.id is not null then
    return jsonb_build_object(
      'code', v_existing.result,
      'scanEventId', v_existing.id,
      'replayed', true
    );
  end if;

  select status into v_status from public.tickets where id = p_ticket_id for update;
  if v_status is null then
    return jsonb_build_object('code', 'invalid', 'message', 'Ticket not found');
  end if;

  if v_status = 'valid' then
    update public.tickets set status = 'used', used_at = now() where id = p_ticket_id;

    insert into public.scan_events (ticket_id, raw_hash, result, gate_id, admin_id, idempotency_key)
    values (p_ticket_id, encode(digest(p_ticket_id, 'sha256'), 'hex'), 'valid', p_gate_id, p_admin_id, v_key)
    returning id into v_event_id;

    return jsonb_build_object('code', 'valid', 'scanEventId', v_event_id, 'replayed', false);
  end if;

  if v_status = 'used' then
    insert into public.scan_events (ticket_id, raw_hash, result, gate_id, admin_id, idempotency_key)
    values (p_ticket_id, encode(digest(p_ticket_id, 'sha256'), 'hex'), 'used', p_gate_id, p_admin_id, v_key)
    returning id into v_event_id;

    return jsonb_build_object('code', 'used', 'scanEventId', v_event_id, 'replayed', false);
  end if;

  return jsonb_build_object('code', 'invalid', 'message', 'Ticket is void');
end;
$$;

create or replace function public.undo_scan(p_scan_event_id text, p_admin_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event public.scan_events%rowtype;
begin
  if not public.is_admin() then
    raise exception 'Admin only' using errcode = '42501';
  end if;

  select * into v_event from public.scan_events where id = p_scan_event_id for update;
  if v_event.id is null then
    raise exception 'Scan event not found' using errcode = 'P0002';
  end if;
  if v_event.result <> 'valid' then
    raise exception 'Only accepted scans can be undone' using errcode = 'P0001';
  end if;
  if v_event.undone_at is not null then
    raise exception 'Scan already undone' using errcode = 'P0001';
  end if;
  if v_event.created_at < now() - interval '60 seconds' then
    raise exception 'Undo window has passed' using errcode = 'P0001';
  end if;

  update public.scan_events set undone_at = now() where id = p_scan_event_id;
  update public.tickets set status = 'valid', used_at = null where id = v_event.ticket_id;

  return jsonb_build_object('ok', true, 'ticketId', v_event.ticket_id);
end;
$$;

grant execute on function public.scan_ticket(text, text, uuid, text) to authenticated;
grant execute on function public.undo_scan(text, uuid) to authenticated;
