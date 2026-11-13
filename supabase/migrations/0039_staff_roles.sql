-- 0039_staff_roles — GAP-03a: the staff role vocabulary is `admin` | `gatekeeper`.
--
-- D-20 scopes the product to exactly two staff roles for now. `admin` keeps
-- every privilege. A `gatekeeper` may scan passes and undo their own scans at a
-- gate; every other operational table stays admin-only, so the narrow role is
-- enforced by the existing RLS policies rather than by a second permission
-- system.
--
-- The role lives in two projections that must agree (D-16):
--   * `public.profiles.role` — what the console displays;
--   * `auth.users.app_metadata.role` — what `is_admin()`/`is_staff()` and the
--     Edge Function guards authorise on.
--
-- `is_admin()` deliberately stays admin-only. The new `is_staff()` is the
-- broader check used by the gate-scanning surface, and it is the only place
-- that enumerates the staff vocabulary in SQL.

-- ── the profile role vocabulary ─────────────────────────────────────────────
-- `drop … if exists` keeps a re-run against a local stack safe; the constraint
-- name is the one Postgres generated for the original inline CHECK.
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in ('customer', 'admin', 'gatekeeper'));

-- ── the staff helper ────────────────────────────────────────────────────────
-- SECURITY DEFINER is not required to read the request JWT, but it matches
-- `is_admin()`: both helpers are stable, schema-pinned and safe to call from a
-- policy or a function guard.
create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (auth.jwt() -> 'app_metadata' ->> 'role') in ('admin', 'gatekeeper'),
    false
  );
$$;

grant execute on function public.is_staff() to anon, authenticated, service_role;

-- ── the gatekeeper's RLS boundary ───────────────────────────────────────────
-- A gatekeeper needs exactly two reads to do the job: the gate registry (to
-- choose the gate they are standing at) and their own scan history (to see
-- what they admitted and undo it inside the 60-second window). Everything
-- else stays behind `is_admin()`.
--
-- The gates read policy is replaced, not added: `admin` is staff too, so two
-- permissive SELECT policies would only duplicate the predicate.
drop policy if exists gates_admin_read on public.gates;
drop policy if exists gates_staff_read on public.gates;
create policy gates_staff_read on public.gates
for select to authenticated using (public.is_staff());

-- Own rows only. A second permissive policy is intentional: the existing
-- `scan_events_admin_read` still gives admins the whole log.
drop policy if exists scan_events_own_read on public.scan_events;
create policy scan_events_own_read on public.scan_events
for select to authenticated
using (public.is_staff() and admin_id = auth.uid());

-- The gate log joins `tickets` to show the fixture and seat of each entry. A
-- gatekeeper may read the ticket row of a pass **they scanned** — the same
-- facts the scan response already returned to them — and nothing else. The
-- holder's profile (email, phone) stays admin-only.
drop policy if exists tickets_staff_scanned_read on public.tickets;
create policy tickets_staff_scanned_read on public.tickets
for select to authenticated
using (
  public.is_staff()
  and exists (
    select 1
    from public.scan_events se
    where se.ticket_id = tickets.id
      and se.admin_id = auth.uid()
  )
);

-- ── the gate surface accepts staff, not only admins ─────────────────────────
-- `scan_ticket` and `undo_scan` were written when "staff" meant "admin". The
-- guard becomes `is_staff()`; everything else about the functions is
-- unchanged, because a gatekeeper's authority is deliberately the same as an
-- admin's *at the gate* and nothing more.
--
-- Both functions now also refuse an `p_admin_id` that is not the caller. The
-- Edge Function always passes `context.user.id`, but the database must not
-- depend on that: without the check, a gatekeeper could file an admission
-- under another operator's name and "undo their own scans" would mean
-- nothing.
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
  v_existing public.scan_events%rowtype;
  v_event_id text;
  v_key text := coalesce(nullif(p_idempotency_key, ''), replace(gen_random_uuid()::text, '-', ''));
  v_hash text := coalesce(nullif(p_raw_hash, ''), encode(digest(coalesce(p_ticket_id, ''), 'sha256'), 'hex'));
  v_result public.scan_result;
  v_message text;
begin
  if not public.is_staff() then
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
set search_path = public, extensions
as $$
declare
  v_event public.scan_events%rowtype;
  v_ticket public.tickets%rowtype;
begin
  if not public.is_staff() then
    raise exception 'Staff only' using errcode = '42501';
  end if;
  if auth.uid() is not null and p_admin_id <> auth.uid() then
    raise exception 'Scan owner mismatch' using errcode = '42501';
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

grant execute on function public.scan_ticket(text, text, uuid, text, text, text) to authenticated;
grant execute on function public.undo_scan(text, uuid, text) to authenticated;
