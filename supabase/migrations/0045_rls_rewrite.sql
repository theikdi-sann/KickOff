-- 0045_rls_rewrite — C7.3: every policy reads membership and tenant (GAP-02).
--
-- The tenancy series (0040–0044) put `tenant_id` columns and composite
-- foreign keys on the schema; this step makes the *behaviour* match
-- (ADR-001, ADR-002, SECURITY §2.1):
--
--   * the helpers stop reading the legacy role claim — `is_admin()` and the
--     new `is_gate_operator()` resolve the caller's `staff_members` row at
--     the club their token claims and read capability flags from
--     `staff_roles` (ADR-001: predicates read capabilities, never role
--     names);
--   * `current_tenant()` gains the one fallback the series needs: a token
--     with no `tenant_id` claim (every session until the white-label
--     `bootstrap` writes one, ADR-004) resolves to the club this deployment
--     serves; a claim that *is* present stays strict, so a suspended or
--     unknown club still resolves to no tenant;
--   * every policy on a tenant-scoped table carries
--     `tenant_id = current_tenant()`; the public catalogue (venues, matches,
--     zones, seats, prices, published news) stays open for SELECT and its
--     writes become tenant-scoped (ADR-002 §6);
--   * the `tenant_id` bridge default of 0042 (a literal club-one uuid)
--     becomes `current_tenant()`: a forgotten column lands in the caller's
--     club instead of club one, and the RLS `with check` rejects a
--     wrong-club value outright;
--   * `audit_logs` and `scan_events` lose their write grants — evidence is
--     written inside security-definer paths only (SECURITY §2.1);
--   * the report views become `security_invoker` so holder PII and revenue
--     apply the caller's RLS, while the two availability aggregates stay
--     definer (they must count every active hold) and are scoped to the
--     caller's club instead.
--
-- Legacy permissive access fails loudly on purpose: a token whose club does
-- not match the row reads nothing and writes nothing.

-- ── current_tenant(): the deployment's club when no claim is present ───────
-- `security definer` so the lookup itself is not filtered by the policies it
-- feeds; `status = 'active'` is the suspension gate.
--
-- The claim is client-controlled data, so it is shape-checked before the cast:
-- a malformed `tenant_id` resolves to no tenant instead of raising from inside
-- an RLS predicate. `case` guarantees the cast only runs on a valid UUID.
--
-- Absence is not malformed: fans carry no tenant claim by design (ADR-001 §6)
-- and `bootstrap` (ADR-004) has not landed, so "no claim" would deny the
-- single-club product every row. An absent claim therefore resolves to the
-- club this deployment serves — the same club the 0042 bridge default wrote —
-- while a present claim resolves strictly, so suspension and unknown clubs
-- keep failing closed.
create or replace function public.current_tenant()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  with claim as (
    select auth.jwt() -> 'app_metadata' ->> 'tenant_id' as raw
  )
  select case
    when c.raw is null or c.raw = '' then (
      select t.id
      from public.tenants t
      where t.id = '00000000-0000-0000-0000-000000000001'
        and t.status = 'active'
    )
    else (
      select t.id
      from public.tenants t
      where t.id = case
        when c.raw ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          then c.raw::uuid
      end
        and t.status = 'active'
    )
  end
  from claim c;
$$;

revoke all on function public.current_tenant() from public;
grant execute on function public.current_tenant() to anon, authenticated, service_role;

-- ── the capability checks ───────────────────────────────────────────────────
-- Authority is the `staff_members` row at the club the token claims; the
-- power comes from that role's capability flags. Both functions are
-- `security definer` so the lookup is not filtered by the very policies that
-- call them (a member's admin read would otherwise recurse through RLS).

-- Console management: the `can_manage_staff` capability.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.staff_members m
    join public.staff_roles r
      on r.tenant_id = m.tenant_id
     and r.code = m.staff_role
    where m.id = auth.uid()
      and m.tenant_id = public.current_tenant()
      and r.can_manage_staff
  );
$$;

grant execute on function public.is_admin() to anon, authenticated, service_role;

-- The broader check: a membership at this club, whatever its powers.
create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.staff_members m
    where m.id = auth.uid()
      and m.tenant_id = public.current_tenant()
  );
$$;

grant execute on function public.is_staff() to anon, authenticated, service_role;

-- ADR-001: scanning is the `can_operate_gate` capability, not a role name,
-- so a club can define its own scanning role without touching SQL.
create or replace function public.is_gate_operator()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.staff_members m
    join public.staff_roles r
      on r.tenant_id = m.tenant_id
     and r.code = m.staff_role
    where m.id = auth.uid()
      and m.tenant_id = public.current_tenant()
      and r.can_operate_gate
  );
$$;

grant execute on function public.is_gate_operator() to anon, authenticated, service_role;

-- ── the bridge default becomes tenant-aware ─────────────────────────────────
-- 0042 gave every scoped table a literal default of the default club so the
-- single-club code kept working; PLAN.md recorded the cost — a forgotten
-- `tenant_id` was a wrong-club write, not an error. The default now derives
-- from the caller's token (the deployment's club when no claim is present),
-- and the RLS `with check` added below rejects an explicit wrong-club value.
alter table public.app_settings
  alter column tenant_id set default public.current_tenant();
alter table public.audit_logs
  alter column tenant_id set default public.current_tenant();
alter table public.gates
  alter column tenant_id set default public.current_tenant();
alter table public.match_gates
  alter column tenant_id set default public.current_tenant();
alter table public.match_zone_prices
  alter column tenant_id set default public.current_tenant();
alter table public.matches
  alter column tenant_id set default public.current_tenant();
alter table public.news_items
  alter column tenant_id set default public.current_tenant();
alter table public.order_seats
  alter column tenant_id set default public.current_tenant();
alter table public.orders
  alter column tenant_id set default public.current_tenant();
alter table public.scan_events
  alter column tenant_id set default public.current_tenant();
alter table public.seat_holds
  alter column tenant_id set default public.current_tenant();
alter table public.seats
  alter column tenant_id set default public.current_tenant();
alter table public.tickets
  alter column tenant_id set default public.current_tenant();
alter table public.venues
  alter column tenant_id set default public.current_tenant();
alter table public.zones
  alter column tenant_id set default public.current_tenant();

-- ── the matrix: reads ───────────────────────────────────────────────────────
-- Commerce rows: the caller's club, and either their own row or the console
-- capability. A fan carries no tenant claim until `bootstrap` writes one; an
-- absent claim resolves to this deployment's club, which is where their rows
-- are (ADR-001 §6, SECURITY §2.1).

drop policy if exists orders_select_own on public.orders;
create policy orders_select_own on public.orders
for select to authenticated
using (
  tenant_id = public.current_tenant()
  and (user_id = auth.uid() or public.is_admin())
);

drop policy if exists order_seats_select_own on public.order_seats;
create policy order_seats_select_own on public.order_seats
for select to authenticated
using (
  tenant_id = public.current_tenant()
  and (
    public.is_admin()
    or exists (
      select 1 from public.orders o
      where o.id = order_seats.order_id and o.user_id = auth.uid()
    )
  )
);

drop policy if exists tickets_select_own on public.tickets;
create policy tickets_select_own on public.tickets
for select to authenticated
using (
  tenant_id = public.current_tenant()
  and (user_id = auth.uid() or public.is_admin())
);

-- A gatekeeper may see a pass they have scanned: the scan log already scopes
-- to their own events, so the pass follows the same boundary.
drop policy if exists tickets_staff_scanned_read on public.tickets;
create policy tickets_staff_scanned_read on public.tickets
for select to authenticated
using (
  tenant_id = public.current_tenant()
  and public.is_staff()
  and exists (
    select 1 from public.scan_events se
    where se.ticket_id = tickets.id and se.admin_id = auth.uid()
  )
);

drop policy if exists seat_holds_select_own on public.seat_holds;
create policy seat_holds_select_own on public.seat_holds
for select to authenticated
using (
  tenant_id = public.current_tenant()
  and (user_id = auth.uid() or public.is_admin())
);

-- Evidence: the club's staff read the club's log; an operator may always
-- re-read their own rows. There is no write policy — the append-only trigger
-- and the revoked grants below are the write story.
drop policy if exists scan_events_admin_read on public.scan_events;
create policy scan_events_admin_read on public.scan_events
for select to authenticated
using (
  tenant_id = public.current_tenant()
  and public.is_admin()
);

drop policy if exists scan_events_own_read on public.scan_events;
create policy scan_events_own_read on public.scan_events
for select to authenticated
using (
  tenant_id = public.current_tenant()
  and public.is_staff()
  and admin_id = auth.uid()
);

drop policy if exists audit_logs_admin_read on public.audit_logs;
create policy audit_logs_admin_read on public.audit_logs
for select to authenticated
using (
  tenant_id = public.current_tenant()
  and public.is_admin()
);

-- Settings: every member of the club may read its configuration (the console
-- and the app render club name, currency and hold rules from it); writing
-- stays admin-only below.
drop policy if exists app_settings_read on public.app_settings;
create policy app_settings_read on public.app_settings
for select to authenticated
using (tenant_id = public.current_tenant());

drop policy if exists staff_members_admin_read on public.staff_members;
create policy staff_members_admin_read on public.staff_members
for select to authenticated
using (
  tenant_id = public.current_tenant()
  and public.is_admin()
);

-- The role vocabulary is club configuration: readable by that club's members
-- only (it carries no personal data, but it is not another club's business).
drop policy if exists staff_roles_read on public.staff_roles;
create policy staff_roles_read on public.staff_roles
for select to authenticated
using (tenant_id = public.current_tenant());

-- The refund ledger is admin evidence (SECURITY §2.1).
drop policy if exists refunds_admin_read on public.refunds;
create policy refunds_admin_read on public.refunds
for select to authenticated
using (
  tenant_id = public.current_tenant()
  and public.is_admin()
);

-- Gates and assignments are ops data: the club's staff read them.
drop policy if exists gates_staff_read on public.gates;
create policy gates_staff_read on public.gates
for select to authenticated
using (
  tenant_id = public.current_tenant()
  and public.is_staff()
);

drop policy if exists match_gates_staff_read on public.match_gates;
create policy match_gates_staff_read on public.match_gates
for select to authenticated
using (
  tenant_id = public.current_tenant()
  and public.is_staff()
);

-- Published news is public catalogue (ADR-002 §6); a draft belongs to its
-- club's editors.
drop policy if exists news_public_read on public.news_items;
create policy news_public_read on public.news_items
for select to anon, authenticated
using (
  published_at <= now()
  or (public.is_admin() and tenant_id = public.current_tenant())
);

-- ── the matrix: writes ──────────────────────────────────────────────────────
-- Every write policy is the admin capability *and* the caller's club; the
-- public catalogue keeps its open read (ADR-002 §6) but its rows are no
-- longer writable across clubs.

drop policy if exists matches_admin_write on public.matches;
create policy matches_admin_write on public.matches
for all to authenticated
using (public.is_admin() and tenant_id = public.current_tenant())
with check (public.is_admin() and tenant_id = public.current_tenant());

drop policy if exists zones_admin_write on public.zones;
create policy zones_admin_write on public.zones
for all to authenticated
using (public.is_admin() and tenant_id = public.current_tenant())
with check (public.is_admin() and tenant_id = public.current_tenant());

drop policy if exists seats_admin_write on public.seats;
create policy seats_admin_write on public.seats
for all to authenticated
using (public.is_admin() and tenant_id = public.current_tenant())
with check (public.is_admin() and tenant_id = public.current_tenant());

drop policy if exists venues_admin_write on public.venues;
create policy venues_admin_write on public.venues
for all to authenticated
using (public.is_admin() and tenant_id = public.current_tenant())
with check (public.is_admin() and tenant_id = public.current_tenant());

drop policy if exists match_zone_prices_admin_write on public.match_zone_prices;
create policy match_zone_prices_admin_write on public.match_zone_prices
for all to authenticated
using (public.is_admin() and tenant_id = public.current_tenant())
with check (public.is_admin() and tenant_id = public.current_tenant());

drop policy if exists news_admin_write on public.news_items;
create policy news_admin_write on public.news_items
for all to authenticated
using (public.is_admin() and tenant_id = public.current_tenant())
with check (public.is_admin() and tenant_id = public.current_tenant());

drop policy if exists gates_admin_write on public.gates;
create policy gates_admin_write on public.gates
for all to authenticated
using (public.is_admin() and tenant_id = public.current_tenant())
with check (public.is_admin() and tenant_id = public.current_tenant());

drop policy if exists match_gates_admin_write on public.match_gates;
create policy match_gates_admin_write on public.match_gates
for all to authenticated
using (public.is_admin() and tenant_id = public.current_tenant())
with check (public.is_admin() and tenant_id = public.current_tenant());

drop policy if exists app_settings_admin_write on public.app_settings;
create policy app_settings_admin_write on public.app_settings
for all to authenticated
using (public.is_admin() and tenant_id = public.current_tenant())
with check (public.is_admin() and tenant_id = public.current_tenant());

-- The reschedule reason is written by the console (0037); the row's tenant
-- comes from the caller's club, so a wrong-club `with check` fails.
drop policy if exists audit_logs_admin_insert on public.audit_logs;
create policy audit_logs_admin_insert on public.audit_logs
for insert to authenticated
with check (public.is_admin() and tenant_id = public.current_tenant());

-- ── evidence: read the ledger, write nothing ────────────────────────────────
-- SECURITY §2.1: UPDATE/DELETE are revoked on the two evidence tables, and
-- the refund ledger becomes readable by the club's admins (it was
-- service-role only, which also hid it from the console).
revoke update, delete on public.audit_logs from anon, authenticated;
revoke insert, update, delete on public.scan_events from anon, authenticated;
grant select on public.refunds to authenticated;

-- ── the scan paths: the gate must be the caller's club ──────────────────────
-- `scan_ticket` and `undo_scan` are security definer, so RLS never sees their
-- reads; the capability check alone would let a valid member of one club
-- operate another club's gate. The gate (or event) must belong to the club
-- the token claims, and the error is the same 'Staff only' as a missing
-- capability so a foreign gate is not confirmed to exist.
--
-- Both paths run as the caller's JWT (the Edge Functions use `userClient`),
-- never as the service role: an unclaimed token resolves to this
-- deployment's club, which is where its gates are.

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
  if not public.is_gate_operator() then
    raise exception 'Staff only' using errcode = '42501';
  end if;
  if auth.uid() is not null and p_admin_id <> auth.uid() then
    raise exception 'Scan owner mismatch' using errcode = '42501';
  end if;

  select * into v_event from public.scan_events where id = p_scan_event_id for update;
  if v_event.id is null then
    raise exception 'Scan event not found' using errcode = 'P0002';
  end if;
  if v_event.tenant_id is distinct from public.current_tenant() then
    raise exception 'Staff only' using errcode = '42501';
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

-- ── views: per-user reports, club-scoped aggregates ─────────────────────────
-- `order_receipt_view` carries holder PII and `match_sales_summary` carries
-- revenue: both are recreated with `security_invoker = true` so the caller's
-- RLS applies row by row (SECURITY §2.1). The sales summary additionally
-- scopes its match rows to the caller's club — matches are open catalogue,
-- so without it every club's fixtures would appear with someone else's
-- revenue attached.

drop view if exists public.match_sales_summary;
create view public.match_sales_summary
with (security_invoker = true) as
select
  m.id as match_id,
  count(distinct o.id) filter (where o.status = 'paid') as orders_paid,
  coalesce(sum(os.price_minor_units) filter (where o.status = 'paid'), 0) as revenue_minor_units,
  count(os.id) filter (where o.status = 'paid') as tickets_sold
from public.matches m
left join public.orders o on o.match_id = m.id
left join public.order_seats os on os.order_id = o.id
where m.tenant_id = public.current_tenant()
group by m.id;

drop view if exists public.order_receipt_view;
create view public.order_receipt_view
with (security_invoker = true) as
select
  o.id as order_id,
  o.user_id,
  o.match_id,
  o.amount_minor_units,
  o.currency,
  o.status,
  o.created_at,
  o.paid_at,
  o.payment_ref,
  p.full_name as holder,
  p.email as holder_email,
  m.opponent,
  m.kickoff_at,
  v.name as venue,
  coalesce(
    jsonb_agg(
      jsonb_build_object(
        'seatId', os.seat_id,
        'ticketId', os.ticket_id,
        'zoneName', os.zone_name,
        'row', os.row_label,
        'number', os.number,
        'priceMinorUnits', os.price_minor_units
      )
      order by os.zone_name, os.row_label, os.number
    ) filter (where os.id is not null),
    '[]'::jsonb
  ) as seats,
  o.tenant_id
from public.orders o
join public.profiles p on p.id = o.user_id
join public.matches m on m.id = o.match_id
join public.venues v on v.id = m.venue_id
left join public.order_seats os on os.order_id = o.id
group by
  o.id, p.full_name, p.email, m.opponent, m.kickoff_at, v.name, o.tenant_id;

grant select on public.match_sales_summary, public.order_receipt_view to authenticated;

-- The two availability aggregates stay `SECURITY DEFINER` on purpose: the
-- seat map must count *every* active hold and pending order line, and under
-- the caller's own-row policies those counts would silently overstate
-- availability (the map would offer held seats). They expose counts only —
-- no row data, no holder — so the open catalogue keeps its full picture, and
-- each is scoped to the caller's club by `current_tenant()` instead.
create or replace view public.zone_availability as
select
  s.zone_id,
  count(*) as total_seats,
  count(*) filter (
    where not exists (
      select 1 from public.seat_holds h
      where h.seat_id = s.id
        and h.released_at is null
        and h.expires_at > now()
    )
    and not exists (
      select 1
      from public.order_seats os
      join public.orders o on o.id = os.order_id
      where os.seat_id = s.id
        and o.status in ('pending', 'paid')
    )
  ) as available_seats,
  s.tenant_id
from public.seats s
where s.tenant_id = public.current_tenant()
group by s.zone_id, s.tenant_id;

create or replace view public.seat_availability as
select h.match_id, h.seat_id
from public.seat_holds h
where h.released_at is null
  and h.expires_at > now()
  and h.tenant_id = public.current_tenant()
union
select os.match_id, os.seat_id
from public.order_seats os
join public.orders o on o.id = os.order_id
where o.status in ('pending', 'paid')
  and os.tenant_id = public.current_tenant();
