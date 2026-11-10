-- 0030_undo_scan_hardening — close the TOCTOU window in the 60s undo.
--
-- Lock the ticket row as well as the scan event so a concurrent admission
-- cannot land between the undo decision and the ticket update, and refuse to
-- undo an older scan when a newer admission for the same ticket exists.

create or replace function public.undo_scan(
  p_scan_event_id text,
  p_admin_id uuid,
  p_gate_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_event public.scan_events%rowtype;
  v_ticket public.tickets%rowtype;
begin
  if not public.is_admin() then
    raise exception 'Admin only' using errcode = '42501';
  end if;
  if auth.uid() is not null and p_admin_id <> auth.uid() then
    raise exception 'Admin mismatch' using errcode = '42501';
  end if;

  select * into v_event from public.scan_events where id = p_scan_event_id for update;
  if v_event.id is null then
    raise exception 'Scan event not found' using errcode = 'P0002';
  end if;
  if v_event.admin_id <> p_admin_id then
    raise exception 'You can only undo your own scans' using errcode = '42501';
  end if;
  if p_gate_id is not null and v_event.gate_id <> p_gate_id then
    raise exception 'This scan was recorded at another gate' using errcode = '42501';
  end if;
  if v_event.result <> 'valid' then
    raise exception 'Only accepted scans can be undone' using errcode = 'P0001';
  end if;
  if v_event.undone_at is not null then
    raise exception 'This scan has already been undone' using errcode = 'P0001';
  end if;
  if v_event.created_at < now() - interval '60 seconds' then
    raise exception 'The 60 second undo window has passed' using errcode = 'P0001';
  end if;

  select * into v_ticket from public.tickets where id = v_event.ticket_id for update;

  if exists (
    select 1 from public.scan_events
    where ticket_id = v_event.ticket_id
      and result = 'valid'
      and undone_at is null
      and created_at > v_event.created_at
  ) then
    raise exception 'A later scan exists for this ticket; undo that one first' using errcode = 'P0001';
  end if;

  update public.scan_events set undone_at = now() where id = p_scan_event_id;
  update public.tickets
  set status = 'valid', used_at = null
  where id = v_event.ticket_id and status = 'used';

  return jsonb_build_object(
    'ok', true,
    'ticketId', v_event.ticket_id,
    'gateId', v_event.gate_id
  );
end;
$$;

grant execute on function public.undo_scan(text, uuid, text) to authenticated;
