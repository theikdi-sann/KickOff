-- 0040_tenants — C6.1: the tenant (club) row, the tenancy helpers and the
-- money-scale helper.
--
-- This is the first step of the account/tenancy series (ADR-001, ADR-002):
--   * 0040 (this file) creates `tenants`, `current_tenant()`, the money scale
--     and an idempotent `provision_tenant()`;
--   * 0041 splits identity (`fans`, per-tenant `staff_roles`, `staff_members`);
--   * 0042 adds `tenant_id` + composite FKs to every scoped table.
--
-- Nothing references `tenants` yet, so this migration is additive and safe to
-- apply while the single-tenant code keeps running. `provision_tenant()` is
-- extended in 0041 (seed roles) and 0042 (seed settings); the signature stays
-- stable.

-- ── the tenant vocabulary ───────────────────────────────────────────────────
-- `suspended` is a lock-out, not a delete: every helper below resolves only
-- an `active` tenant, so a suspended club keeps its data but loses all access.
do $$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where t.typname = 'tenant_status' and n.nspname = 'public'
  ) then
    create type public.tenant_status as enum ('active', 'suspended');
  end if;
end $$;

-- ── the tenant row ──────────────────────────────────────────────────────────
create table if not exists public.tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) > 0),
  -- The white-label app binds to a club by slug (ADR-004): lowercase, single
  -- hyphens, no leading/trailing separator.
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  currency text not null default 'THB' check (currency ~ '^[A-Z]{3}$'),
  locale text not null default 'th-TH' check (length(btrim(locale)) > 0),
  logo_url text,
  primary_color text not null default '#0B6B3A',
  status public.tenant_status not null default 'active',
  -- Stripe Connect account (acct_…). Configuration, never a secret (ADR-003).
  stripe_account_id text,
  -- Platform fee in basis points (0…10000), snapshotted on each order.
  application_fee_bps integer not null default 0
    check (application_fee_bps between 0 and 10000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists tenants_set_updated_at on public.tenants;
create trigger tenants_set_updated_at
before update on public.tenants
for each row execute function public.set_updated_at();

-- ── RLS ─────────────────────────────────────────────────────────────────────
-- Branding is public by design (the white-label app renders it before sign-in),
-- but the club row also carries commercial configuration. Members therefore
-- read the branding columns only; the platform fee and the Connect account
-- stay service-role. Writes are service-role only: the default Supabase grants
-- are revoked, and there is deliberately no write policy, so a member cannot
-- rename a club even if a future policy is added by mistake.
alter table public.tenants enable row level security;

drop policy if exists tenants_public_read on public.tenants;
create policy tenants_public_read on public.tenants
for select to anon, authenticated
using (status = 'active');

revoke all on public.tenants from anon, authenticated;
grant select (id, name, slug, currency, locale, logo_url, primary_color, status)
  on public.tenants to anon, authenticated;
grant all on public.tenants to service_role;

-- ── helpers ─────────────────────────────────────────────────────────────────
-- The caller's active tenant. `security definer` so the lookup itself is not
-- filtered by the policy above; `status = 'active'` is the suspension gate.
--
-- The claim is client-controlled data, so it is shape-checked before the cast:
-- a malformed `tenant_id` resolves to no tenant instead of raising from inside
-- an RLS predicate. `case` guarantees the cast only runs on a valid UUID.
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
  select t.id
  from public.tenants t
  cross join claim c
  where t.status = 'active'
    and t.id = case
      when c.raw ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        then c.raw::uuid
    end;
$$;

revoke all on function public.current_tenant() from public;
grant execute on function public.current_tenant() to anon, authenticated, service_role;

-- The one owner of the minor-unit scale in SQL. Keep in step with
-- `minorUnitScale()` in `packages/shared/src/money.ts`: both throw on a code
-- that is not three letters, so a typo cannot silently become a ×100 bug.
create or replace function public.minor_units(p_currency text)
returns integer
language plpgsql
immutable
set search_path = public
as $$
begin
  if p_currency is null or p_currency !~ '^[A-Za-z]{3}$' then
    raise exception 'minor_units expects a three-letter ISO-4217 code (got %)',
      coalesce(p_currency, '<null>')
      using errcode = '22023';
  end if;

  return case upper(p_currency)
    -- zero-decimal currencies
    when 'BIF' then 0 when 'CLP' then 0 when 'DJF' then 0 when 'GNF' then 0
    when 'ISK' then 0 when 'JPY' then 0 when 'KMF' then 0 when 'KRW' then 0
    when 'PYG' then 0 when 'RWF' then 0 when 'UGX' then 0 when 'UYI' then 0
    when 'VND' then 0 when 'VUV' then 0 when 'XAF' then 0 when 'XOF' then 0
    when 'XPF' then 0
    -- three-decimal currencies
    when 'BHD' then 3 when 'IQD' then 3 when 'JOD' then 3 when 'KWD' then 3
    when 'LYD' then 3 when 'OMR' then 3 when 'TND' then 3
    else 2
  end;
end;
$$;

grant execute on function public.minor_units(text) to anon, authenticated, service_role;

-- ── provisioning ────────────────────────────────────────────────────────────
-- Idempotent by slug: re-running with the same slug returns the existing club
-- instead of creating a second one, and never changes the currency (money
-- must not move under a live club). 0041/0042 replace this function to seed
-- roles and settings; the signature stays stable.
create or replace function public.provision_tenant(
  p_name text,
  p_slug text,
  p_currency text default 'THB',
  p_locale text default 'th-TH'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  -- Validate before the insert so the caller gets a named argument, not a
  -- constraint name from three layers down.
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

  insert into public.tenants (name, slug, currency, locale)
  values (btrim(p_name), p_slug, upper(p_currency), btrim(p_locale))
  on conflict (slug) do update
    set name = excluded.name
  returning id into v_id;

  return v_id;
end;
$$;

-- Provisioning is a platform operation, never a client call.
revoke all on function public.provision_tenant(text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.provision_tenant(text, text, text, text)
  to service_role;

-- ── the existing single club ────────────────────────────────────────────────
-- 0042 backfills every scoped table to this row, so it must exist before the
-- backfill runs. The fixed id is intentional: migrations reference it. A
-- conflicting `kickoff` slug under another id is a real error, so the insert
-- fails loudly instead of silently leaving the fixed row missing.
insert into public.tenants (id, name, slug)
values ('00000000-0000-0000-0000-000000000001', 'KickOff', 'kickoff')
on conflict (id) do nothing;
