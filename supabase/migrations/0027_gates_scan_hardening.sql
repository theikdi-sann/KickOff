-- 0027_gates_scan_hardening — gate registry + production-grade scan auditing.
--
-- F-4: a gate is a first-class row with its own assigned fixture, so
-- `wrong_match` can be decided server-side and never leaks to the client.
-- The scan window is kick-off -2h .. +2h (F-4 follow-up, chosen 2026-11-10).

create table public.gates (
  id text primary key,
  name text not null,
  match_id text references public.matches (id) on delete set null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index gates_match_id_idx on public.gates (match_id);

create trigger gates_set_updated_at
before update on public.gates
for each row execute function public.set_updated_at();

alter table public.gates enable row level security;

create policy gates_admin_read on public.gates
for select to authenticated using (public.is_admin());

create policy gates_admin_write on public.gates
for all to authenticated using (public.is_admin()) with check (public.is_admin());

grant select, insert, update, delete on public.gates to authenticated;

-- Scanned QR payloads may reference a ticket that does not exist (forged code,
-- deleted ticket). The audit row still has to be written, so the FK is optional.
alter table public.scan_events alter column ticket_id drop not null;

alter table public.scan_events
  add constraint scan_events_gate_id_fkey
  foreign key (gate_id) references public.gates (id) on delete restrict;

-- Replace the Phase 3 primitives with versions that log every outcome.
drop function if exists public.scan_ticket(text, text, uuid, text);
drop function if exists public.undo_scan(text, uuid);

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
set search_path = public
as $$
declare
  v_gate public.gates%rowtype;
  v_ticket public.tickets%rowtype;
  v_match public.matches%rowtype;
  v_existing public.scan_events%rowtype;
  v_event_id text;
  v_key text := coalesce(nullif(p_idempotency_key, ''), replace(gen_random_uuid()::text, '-', ''));
  v_hash text := coalesce(nullif(p_raw_hash, ''), encode(digest(coalesce(p_ticket_id, ''), 'sha256'), 'hex'));
  v_result public.scan_result;
  v_message text;
begin
  if not public.is_admin() then
    raise exception 'Admin only' using errcode = '42501';
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
  if not v_gate.active then
    raise exception 'Gate is inactive' using errcode = 'P0001';
  end if;
  if v_gate.match_id is null then
    raise exception 'Gate has no fixture assigned' using errcode = 'P0001';
  end if;

  select t.* into v_ticket from public.tickets t where t.id = p_ticket_id for update;
  select m.* into v_match from public.matches m where m.id = v_gate.match_id;

  if v_ticket.id is null then
    v_result := 'invalid';
    v_message := 'Ticket not found';
  elsif p_invalid_reason is not null then
    -- The Edge Function rejected the signature/nonce before we got here.
    v_result := 'invalid';
    v_message := p_invalid_reason;
  elsif v_ticket.match_id <> v_gate.match_id then
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
  else
    v_result := 'valid';
    v_message := 'Welcome in';
  end if;

  if v_result = 'valid' then
    update public.tickets
    set status = 'used', used_at = now()
    where id = v_ticket.id;
  end if;

  insert into public.scan_events
    (ticket_id, raw_hash, result, gate_id, admin_id, idempotency_key)
  values
    (v_ticket.id, v_hash, v_result, p_gate_id, p_admin_id, v_key)
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

create or replace function public.undo_scan(
  p_scan_event_id text,
  p_admin_id uuid,
  p_gate_id text default null
)
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

grant execute on function public.scan_ticket(text, text, uuid, text, text, text) to authenticated;
grant execute on function public.undo_scan(text, uuid, text) to authenticated;
