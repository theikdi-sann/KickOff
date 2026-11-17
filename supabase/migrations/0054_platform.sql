-- 0054_platform — C9.1: the platform authority (ADR-004 §3).
--
-- KickOff staff provision clubs, set fee rates, suspend/restore tenants and
-- read the tenant *registry*. That surface needs an authority of its own:
-- club staff authority (`is_admin()`) is scoped to one tenant and must never
-- reach across clubs.
--
-- The authority has two projections, like every other tier (D-16's pattern):
--
--   * `public.platform_admins` — the membership the *database* reads
--     (`is_platform_admin()`);
--   * `auth.users.app_metadata.platform` — the claim the console proxy and
--     the Edge guards read.
--
-- `set_platform_admin()` writes both together and is the only writer of
-- either: a grant that moved only one projection would leave the console
-- showing an authority the database refuses (or the reverse).
--
-- Every platform mutation is a guarded RPC — the `admin_update_match`
-- pattern — so the guard travels with the operation it protects, and the
-- console calls it over PostgREST like any other RPC. `session_user` is
-- deliberately not an escape hatch: it describes the connection, not the
-- request, and the JWT role is what PostgREST authenticates.

-- ── the membership ───────────────────────────────────────────────────────────
create table if not exists public.platform_admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  granted_at timestamptz not null default now()
);

-- RLS on, no policies: the only readers are the security-definer helpers
-- below, which run as the owner. A client that reaches the table directly
-- reads nothing — even if a grant or a policy is added by mistake later.
alter table public.platform_admins enable row level security;

-- ── the public read no longer shows a tombstone ──────────────────────────────
-- `erase_tenant` (0052) keeps the `tenants` row as the record that the club
-- existed — but a tombstone is not a club: it must not appear in the public
-- branding read, and (consequently) `bootstrap` must not bind a session to
-- it. The policy is the one place that decides what the *public* read sees;
-- the definer and service-role surfaces below filter `erased_at` themselves,
-- because they bypass RLS by design.
drop policy if exists tenants_public_read on public.tenants;
create policy tenants_public_read on public.tenants
for select to anon, authenticated
using (status = 'active' and erased_at is null);

-- ── the predicates ───────────────────────────────────────────────────────────
-- The membership the database reads, by the caller's JWT subject.
create or replace function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.platform_admins
    where user_id = auth.uid()
  );
$$;

revoke all on function public.is_platform_admin() from public;
grant execute on function public.is_platform_admin()
  to anon, authenticated, service_role;

-- Who may act on the platform surface: a platform admin, or the service role
-- (Edge Functions and the runbook). One guard, used by every platform RPC —
-- a second copy of this expression is a second thing to get wrong.
create or replace function public.is_platform_operator()
returns boolean
language sql
stable
set search_path = public
as $$
  select public.is_platform_admin()
      or coalesce(auth.jwt() ->> 'role', '') = 'service_role';
$$;

revoke all on function public.is_platform_operator() from public;
grant execute on function public.is_platform_operator()
  to anon, authenticated, service_role;

-- ── the grant ────────────────────────────────────────────────────────────────
-- Service-role only: granting the platform authority is an operator action
-- (the runbook, an Edge job), never something a session can do for itself.
create or replace function public.set_platform_admin(
  p_user_id uuid,
  p_grant boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- The JWT role is the caller PostgREST authenticates; `session_user` is
  -- the connection, not the request, so it is not an escape here (a local
  -- session runs this with `set local role service_role`).
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;

  if p_user_id is null or p_grant is null then
    raise exception 'set_platform_admin needs a user id and a grant (true or false)'
      using errcode = '22023';
  end if;

  if not exists (select 1 from auth.users where id = p_user_id) then
    raise exception 'User not found' using errcode = 'P0002';
  end if;

  if p_grant then
    insert into public.platform_admins (user_id)
    values (p_user_id)
    on conflict (user_id) do nothing;

    -- Merge the claim, never replace it: a claim another tier owns (the
    -- tenant claim the white-label `bootstrap` writes) must survive a grant.
    update auth.users
       set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb)
                               || jsonb_build_object('platform', true)
     where id = p_user_id;
  else
    delete from public.platform_admins where user_id = p_user_id;

    -- Only the platform key goes: `role`, `tenant_id` and the rest stay.
    update auth.users
       set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb)
                               - 'platform'
     where id = p_user_id;
  end if;
end;
$$;

revoke all on function public.set_platform_admin(uuid, boolean)
  from public, anon, authenticated;
grant execute on function public.set_platform_admin(uuid, boolean)
  to service_role;

-- ── the registry ─────────────────────────────────────────────────────────────
-- The console's read surface: *tenants* only. Suspended clubs are listed
-- because restoring one is this console's job, and the commercial columns
-- are exactly what it edits — row-level club data stays behind each club's
-- own authority.
create or replace function public.platform_tenants()
returns setof public.tenants
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_platform_operator() then
    raise exception 'Platform access required' using errcode = '42501';
  end if;

  return query
    select * from public.tenants
    -- A tombstone (0052) is not an operable club: it is the record that the
    -- club existed. This function bypasses RLS, so the filter is explicit.
    where erased_at is null
    order by created_at, slug;
end;
$$;

revoke all on function public.platform_tenants() from public, anon;
grant execute on function public.platform_tenants()
  to authenticated, service_role;

-- ── suspend / restore ────────────────────────────────────────────────────────
create or replace function public.set_tenant_status(
  p_tenant_id uuid,
  p_status text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_from public.tenant_status;
  v_erased timestamptz;
begin
  if not public.is_platform_operator() then
    raise exception 'Platform access required' using errcode = '42501';
  end if;

  -- The enum is the vocabulary: a status outside it is refused by name
  -- instead of a cast error three layers down.
  if p_status is null
     or not exists (
       select 1
       from pg_enum e
       join pg_type t on t.oid = e.enumtypid
       join pg_namespace n on n.oid = t.typnamespace
       where t.typname = 'tenant_status'
         and n.nspname = 'public'
         and e.enumlabel = p_status
     ) then
    raise exception
      'set_tenant_status needs a status the tenant_status enum knows (active or suspended)'
      using errcode = '22023';
  end if;

  select status, erased_at into v_from, v_erased
  from public.tenants
  where id = p_tenant_id
  for update;

  if not found then
    raise exception 'Tenant not found' using errcode = 'P0002';
  end if;

  -- An erased club (0052) is a tombstone — the record that it existed, not
  -- an operable club. Suspending or restoring one would be a lie about
  -- state the erase already made final.
  if v_erased is not null then
    raise exception 'Club is erased' using errcode = '55000';
  end if;

  -- A no-op changes nothing and audits nothing: the row's `updated_at` is
  -- not bumped for a status it already has.
  if v_from = p_status::public.tenant_status then
    return;
  end if;

  update public.tenants
     set status = p_status::public.tenant_status
   where id = p_tenant_id;

  insert into public.audit_logs (actor_id, action, entity, entity_id, metadata)
  values (
    auth.uid(),
    'tenant.status_changed',
    'tenant',
    p_tenant_id::text,
    jsonb_build_object('from', v_from::text, 'to', p_status)
  );
end;
$$;

revoke all on function public.set_tenant_status(uuid, text)
  from public, anon;
grant execute on function public.set_tenant_status(uuid, text)
  to authenticated, service_role;

-- ── the fee rate ─────────────────────────────────────────────────────────────
create or replace function public.set_application_fee_bps(
  p_tenant_id uuid,
  p_fee_bps integer
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  -- Basis points: the platform fee is a share of the order, so the valid
  -- range is the one the `tenants` CHECK constraint holds (0040) — validated
  -- here by name so the caller gets the argument error, not the constraint.
  v_min_bps constant integer := 0;
  v_max_bps constant integer := 10000; -- 100% of the order
  v_from integer;
  v_erased timestamptz;
begin
  if not public.is_platform_operator() then
    raise exception 'Platform access required' using errcode = '42501';
  end if;

  if p_fee_bps is null
     or p_fee_bps < v_min_bps
     or p_fee_bps > v_max_bps then
    raise exception
      'set_application_fee_bps needs a rate between 0 and 10000 basis points'
      using errcode = '22023';
  end if;

  select application_fee_bps, erased_at into v_from, v_erased
  from public.tenants
  where id = p_tenant_id
  for update;

  if not found then
    raise exception 'Tenant not found' using errcode = 'P0002';
  end if;

  -- A tombstone (0052) prices nothing: the erase is final.
  if v_erased is not null then
    raise exception 'Club is erased' using errcode = '55000';
  end if;

  if v_from = p_fee_bps then
    return;
  end if;

  update public.tenants
     set application_fee_bps = p_fee_bps
   where id = p_tenant_id;

  insert into public.audit_logs (actor_id, action, entity, entity_id, metadata)
  values (
    auth.uid(),
    'tenant.fee_changed',
    'tenant',
    p_tenant_id::text,
    jsonb_build_object('from', v_from, 'to', p_fee_bps)
  );
end;
$$;

revoke all on function public.set_application_fee_bps(uuid, integer)
  from public, anon;
grant execute on function public.set_application_fee_bps(uuid, integer)
  to authenticated, service_role;

-- ── provisioning joins the platform surface ──────────────────────────────────
-- The body is 0053's unchanged; only the guard is new. `create or replace`
-- cannot change an argument list, so the signature stays as it is.
create or replace function public.provision_tenant(
  p_name text,
  p_slug text,
  p_currency text default 'THB',
  p_locale text default 'th-TH',
  p_timezone text default 'Asia/Bangkok'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  -- Platform authority first: an unauthorized caller learns nothing about
  -- which parameters would have been valid.
  if not public.is_platform_operator() then
    raise exception 'Platform access required' using errcode = '42501';
  end if;

  if p_name is null or length(btrim(p_name)) = 0 then
    raise exception 'provision_tenant needs a club name'
      using errcode = '22023';
  end if;

  if p_slug is null or p_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then
    raise exception 'provision_tenant needs a lowercase slug (a-z, 0-9, single hyphens)'
      using errcode = '22023';
  end if;

  if p_currency is null or p_currency !~ '^[A-Za-z]{3}$' then
    raise exception 'provision_tenant needs a three-letter ISO-4217 currency'
      using errcode = '22023';
  end if;

  if p_locale is null or length(btrim(p_locale)) = 0 then
    raise exception 'provision_tenant needs a locale (for example th-TH)'
      using errcode = '22023';
  end if;

  -- `pg_timezone_names` is the database's own list of IANA zones — a zone it
  -- does not know is one no formatter can render a kickoff in.
  if p_timezone is null
     or not exists (select 1 from pg_timezone_names where name = p_timezone) then
    raise exception 'provision_tenant needs a known time zone (for example Asia/Bangkok)'
      using errcode = '22023';
  end if;

  -- An erased club's slug is retired (0052): the tombstone is the record
  -- that the club existed, and `on conflict (slug) do update` would hand
  -- the new club that purged, erased row — invisible to every surface that
  -- filters tombstones.
  if exists (
    select 1 from public.tenants where slug = p_slug and erased_at is not null
  ) then
    raise exception 'provision_tenant: that slug belonged to an erased club'
      using errcode = '55000';
  end if;

  insert into public.tenants (name, slug, currency, locale, timezone)
  values (btrim(p_name), p_slug, upper(p_currency), btrim(p_locale), btrim(p_timezone))
  on conflict (slug) do update
    set name = excluded.name
  returning id into v_id;

  insert into public.staff_roles
    (tenant_id, code, name, can_manage_staff, can_operate_gate, sort_order)
  values
    (v_id, 'admin', 'Admin', true, true, 1),
    (v_id, 'gatekeeper', 'Gatekeeper', false, true, 2)
  on conflict (tenant_id, code) do nothing;

  return v_id;
end;
$$;

-- The console may *call* it — a platform admin passes the guard inside; a
-- plain member is refused by that guard, which the suite proves behaviourally
-- rather than by an ACL that would also hide a platform admin.
revoke all on function public.provision_tenant(text, text, text, text, text)
  from public, anon;
grant execute on function public.provision_tenant(text, text, text, text, text)
  to authenticated, service_role;
