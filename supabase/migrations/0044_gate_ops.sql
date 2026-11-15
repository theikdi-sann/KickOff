-- 0044_gate_ops — C7.2: gate operations (F-4 follow-up, REQ-20, ADR-002).
--
-- 0027 made a gate a first-class row, but kept its fixture *on the gate*.
-- That shape has three problems this step removes:
--
--   * one gate, one fixture — the same turnstile cannot serve two matchdays
--     without being rewritten, and deleting a fixture used to silently leave
--     the gate unassigned (`on delete set null`) rather than re-pointing it;
--   * a gate belonged to a fixture, not to a ground — `gates.venue_id` now
--     says where the turnstile physically stands, and a venue cannot be
--     deleted out from under it;
--   * the scan log could not say which fixture a scan admitted for, who
--     operated the scanner as a *staff member* (the account identity stays in
--     `admin_id`), or who undid an admission — `match_id`, `operator_id` and
--     `undone_by` record exactly that, by the same composite
--     `(id, tenant_id)` foreign keys the rest of the series uses.
--
-- The log itself becomes append-only: a row may be inserted, and may take the
-- one transition an undo makes (its undo stamp), and nothing else. Foreign-key
-- cascades still work — they fire the trigger at depth ≥ 2 — and an explicit
-- maintenance session (owner role + session flag) is the only way to purge.
--
-- Ordering matters: every backfill reads `gates.match_id`, so the join is
-- populated *before* that column is dropped, and the RPCs are rewritten in the
-- same step that removes the column they used to read.

-- ── gates become physical: bound to a venue ─────────────────────────────────
alter table public.gates add column if not exists venue_id text;

-- Backfill from the fixture the gate used to be assigned to; a gate whose
-- fixture is already gone falls back to its club's own venue. If a club has
-- neither a fixture nor a venue the update leaves the column NULL and the
-- `set not null` below refuses — a gate must stand somewhere, and inventing
-- a ground for it would be worse than failing the migration.
--
-- The whole derivation reads `gates.match_id`, so it runs only while that
-- column still exists: re-running the migration must not fail on a column
-- the first run dropped.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'gates'
      and column_name = 'match_id'
  ) then
    update public.gates g
       set venue_id = coalesce(
         (select m.venue_id from public.matches m
           where m.id = g.match_id and m.tenant_id = g.tenant_id),
         (select v.id from public.venues v
           where v.tenant_id = g.tenant_id
           order by v.created_at, v.id
           limit 1)
       )
     where g.venue_id is null;
  end if;
end $$;

alter table public.gates alter column venue_id set not null;

alter table public.gates drop constraint if exists gates_match_id_fkey;
alter table public.gates drop constraint if exists gates_venue_id_fkey;
alter table public.gates add constraint gates_venue_id_fkey
  foreign key (venue_id, tenant_id)
  references public.venues (id, tenant_id) not valid;
alter table public.gates validate constraint gates_venue_id_fkey;

create index if not exists gates_venue_id_idx on public.gates (venue_id);
-- `gates_tenant_match_idx` is dropped with the `match_id` column below; this
-- is its tenant-led replacement, so the 0045 predicates keep their index.
create index if not exists gates_tenant_venue_idx on public.gates (tenant_id, venue_id);

-- ── match_gates: the fixture assignment is a row, not a column ──────────────
create table if not exists public.match_gates (
  match_id text not null,
  gate_id text not null,
  tenant_id uuid not null default '00000000-0000-0000-0000-000000000001',
  created_at timestamptz not null default now(),
  constraint match_gates_pkey primary key (match_id, gate_id)
);

-- Carry the existing assignments across before `gates.match_id` goes away —
-- and only while that column still exists, for the same re-run reason.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'gates'
      and column_name = 'match_id'
  ) then
    insert into public.match_gates (match_id, gate_id, tenant_id)
    select g.match_id, g.id, g.tenant_id
      from public.gates g
     where g.match_id is not null
    on conflict (match_id, gate_id) do nothing;
  end if;
end $$;

alter table public.match_gates drop constraint if exists match_gates_match_id_fkey;
alter table public.match_gates add constraint match_gates_match_id_fkey
  foreign key (match_id, tenant_id)
  references public.matches (id, tenant_id) on delete cascade not valid;
alter table public.match_gates validate constraint match_gates_match_id_fkey;

alter table public.match_gates drop constraint if exists match_gates_gate_id_fkey;
alter table public.match_gates add constraint match_gates_gate_id_fkey
  foreign key (gate_id, tenant_id)
  references public.gates (id, tenant_id) on delete cascade not valid;
alter table public.match_gates validate constraint match_gates_gate_id_fkey;

alter table public.match_gates drop constraint if exists match_gates_tenant_id_fkey;
alter table public.match_gates add constraint match_gates_tenant_id_fkey
  foreign key (tenant_id) references public.tenants (id) not valid;
alter table public.match_gates validate constraint match_gates_tenant_id_fkey;

create index if not exists match_gates_gate_idx on public.match_gates (gate_id);

alter table public.match_gates enable row level security;

-- The same boundary as the registry it hangs off: staff read the assignment
-- (the scanner console shows which fixtures a gate covers), only an admin
-- writes it.
drop policy if exists match_gates_staff_read on public.match_gates;
create policy match_gates_staff_read on public.match_gates
for select to authenticated using (public.is_staff());

drop policy if exists match_gates_admin_write on public.match_gates;
create policy match_gates_admin_write on public.match_gates
for all to authenticated using (public.is_admin()) with check (public.is_admin());

grant select, insert, update, delete on public.match_gates to authenticated;

-- The gate no longer stores its fixture. Dropping the column also drops
-- `gates_match_id_fkey` and `gates_tenant_match_idx` with it.
alter table public.gates drop column if exists match_id;

-- ── scan_events: which fixture, which operator, who undid it ────────────────
alter table public.scan_events
  add column if not exists match_id text,
  add column if not exists operator_id uuid,
  add column if not exists undone_by uuid;

-- Backfill what the log can honestly know: the fixture of each scanned pass,
-- and the membership the account held at the time. `undone_by` stays NULL for
-- historical rows — the old undo recorded only *when*, and naming the scanner
-- as the undoer would be a lie.
update public.scan_events se
   set match_id = t.match_id
  from public.tickets t
 where t.id = se.ticket_id
   and se.match_id is null
   and t.match_id is distinct from se.match_id;

update public.scan_events se
   set operator_id = se.admin_id
  from public.staff_members sm
 where sm.id = se.admin_id
   and sm.tenant_id = se.tenant_id
   and se.operator_id is null;

alter table public.scan_events drop constraint if exists scan_events_match_id_fkey;
alter table public.scan_events add constraint scan_events_match_id_fkey
  foreign key (match_id, tenant_id)
  references public.matches (id, tenant_id) on delete set null (match_id) not valid;
alter table public.scan_events validate constraint scan_events_match_id_fkey;

-- The account stays the account (`admin_id` → `auth.users`); the membership
-- is the authority it acted under, and is cleared if that membership is ever
-- revoked or deleted — the admission itself never disappears.
alter table public.scan_events drop constraint if exists scan_events_operator_id_fkey;
alter table public.scan_events add constraint scan_events_operator_id_fkey
  foreign key (operator_id, tenant_id)
  references public.staff_members (id, tenant_id)
  on delete set null (operator_id) not valid;
alter table public.scan_events validate constraint scan_events_operator_id_fkey;

alter table public.scan_events drop constraint if exists scan_events_undone_by_fkey;
alter table public.scan_events add constraint scan_events_undone_by_fkey
  foreign key (undone_by, tenant_id)
  references public.staff_members (id, tenant_id)
  on delete set null (undone_by) not valid;
alter table public.scan_events validate constraint scan_events_undone_by_fkey;

-- Fixture-scoped reads, and the `set null` above when a fixture is deleted —
-- without it a fixture delete would walk the whole log. The operator columns
-- are deliberately left unindexed: they are only ever touched by a staff
-- deletion, which is rare, and the log is ordered by time.
create index if not exists scan_events_match_id_idx on public.scan_events (match_id);

-- ── scan_ticket: assignment via match_gates, the new columns on the row ─────
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
  v_operator uuid;
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
  if not exists (
    select 1 from public.match_gates mg where mg.gate_id = v_gate.id
  ) then
    raise exception 'Gate has no fixture assigned' using errcode = 'P0001';
  end if;

  select t.* into v_ticket from public.tickets t where t.id = p_ticket_id for update;
  select m.* into v_match from public.matches m where m.id = v_ticket.match_id;

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
  -- An account without one (a platform admin) still scans — the event simply
  -- records no operator, and `admin_id` keeps the accountable identity.
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

-- ── undo_scan: stamp the undo, and the undoer ───────────────────────────────
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

  -- The undoer is the operator's membership at the scan's club; an account
  -- without one leaves `undone_by` NULL rather than failing the undo.
  update public.scan_events
     set undone_at = now(),
         undone_by = (
           select sm.id from public.staff_members sm
            where sm.id = p_admin_id and sm.tenant_id = v_event.tenant_id
         )
   where id = p_scan_event_id;

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

-- ── the log is append-only ──────────────────────────────────────────────────
-- Two ways a row changes without going through the RPCs, both deliberate:
--
--   * referential integrity — a foreign-key `cascade` or `set null` fired by
--     another table's delete runs this trigger at depth ≥ 2. The database is
--     acting, not an editor;
--   * maintenance — an explicit purge, allowed only when the session sets
--     `kickoff.scan_events_maintenance = on` **and** the current role is a
--     member of the table owner's role. The role check is what gives the flag
--     meaning: any session can set a custom GUC, so the flag alone would be a
--     lock with the key taped to it.
create or replace function public.scan_events_append_only()
returns trigger
language plpgsql
as $$
begin
  if current_setting('kickoff.scan_events_maintenance', true) = 'on'
     and pg_has_role(current_user, 'postgres', 'member') then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  if pg_trigger_depth() > 1 then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  if tg_op = 'INSERT' then
    return new;
  end if;

  -- The one transition an undo makes: a live entry takes its undo stamp and
  -- the membership that stamped it. Nothing else on the row may move, and an
  -- entry that is already undone is final.
  if tg_op = 'UPDATE'
     and old.undone_at is null
     and new.undone_at is not null
     and new.id = old.id
     and new.ticket_id is not distinct from old.ticket_id
     and new.raw_hash = old.raw_hash
     and new.result = old.result
     and new.gate_id = old.gate_id
     and new.admin_id = old.admin_id
     and new.idempotency_key = old.idempotency_key
     and new.created_at = old.created_at
     and new.tenant_id = old.tenant_id
     and new.match_id is not distinct from old.match_id
     and new.operator_id is not distinct from old.operator_id
     and (old.undone_by is null or new.undone_by = old.undone_by)
  then
    return new;
  end if;

  raise exception 'scan_events is append-only: rows cannot be % after they are written',
    case when tg_op = 'DELETE' then 'deleted' else 'updated' end
    using errcode = '55000';
end;
$$;

drop trigger if exists scan_events_append_only on public.scan_events;
create trigger scan_events_append_only
before insert or update or delete on public.scan_events
for each row execute function public.scan_events_append_only();
