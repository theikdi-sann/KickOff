-- 0041_identity_split — C6.2: global identity, per-tenant authority.
--
-- 0040 created the tenant row. This step splits the account model ADR-001
-- describes:
--   * `fans` — "this person buys tickets"; global by design;
--   * `staff_roles` — the role vocabulary per tenant, with capability flags
--     instead of an enum;
--   * `staff_members(id, tenant_id)` — a person's authority at one club.
--
-- The legacy `profiles.role` column stays live until 0048. A trigger mirrors
-- every change of that column into `staff_members`, so the old console and
-- Edge write path keep working while the new table is authoritative. The
-- trigger writes only the default club: the legacy role is global, and this
-- deployment serves one club until the RLS rewrite in 0045.

-- ── fans ────────────────────────────────────────────────────────────────────
-- A fan is a person, not a club relationship: the per-club relationship lives
-- in orders and holds. The row marks "this account buys tickets", so the
-- buying flow can stop treating every profile as a customer.
create table if not exists public.fans (
  id uuid primary key references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.fans enable row level security;

drop policy if exists fans_own_read on public.fans;
create policy fans_own_read on public.fans
for select to authenticated using (id = auth.uid());

revoke all on public.fans from anon, authenticated;
grant select on public.fans to authenticated;
grant all on public.fans to service_role;

-- ── staff_roles: the vocabulary, as data ────────────────────────────────────
-- Adding a role or changing its powers is a row change, not a migration
-- (ADR-001 §4). Capabilities are the only thing predicates may read: a new
-- role works everywhere without touching SQL.
create table if not exists public.staff_roles (
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  code text not null check (code ~ '^[a-z][a-z0-9_]*$'),
  name text not null check (length(btrim(name)) > 0),
  can_manage_staff boolean not null default false,
  can_operate_gate boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  primary key (tenant_id, code)
);

alter table public.staff_roles enable row level security;

-- The vocabulary is club configuration, readable by every signed-in member.
-- The tenant-scoped predicate arrives with the 0045 RLS rewrite; until then
-- one club exists, so a broad read exposes nothing another club owns.
drop policy if exists staff_roles_read on public.staff_roles;
create policy staff_roles_read on public.staff_roles
for select to authenticated using (true);

revoke all on public.staff_roles from anon, authenticated;
grant select on public.staff_roles to authenticated;
grant all on public.staff_roles to service_role;

-- ── staff_members: authority is per tenant ──────────────────────────────────
-- Identity stays global (profiles); this row is the per-club grant. The
-- composite FK to `staff_roles` makes a membership with a role the club never
-- defined impossible, independent of any policy.
create table if not exists public.staff_members (
  id uuid not null references public.profiles (id) on delete cascade,
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  staff_role text not null,
  granted_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (id, tenant_id),
  foreign key (tenant_id, staff_role)
    references public.staff_roles (tenant_id, code)
);

create index if not exists staff_members_tenant_idx
  on public.staff_members (tenant_id);

drop trigger if exists staff_members_set_updated_at on public.staff_members;
create trigger staff_members_set_updated_at
before update on public.staff_members
for each row execute function public.set_updated_at();

alter table public.staff_members enable row level security;

-- A member may always see their own authority; an admin sees the club's list.
-- Both are read-only: the write path is the Edge Function (service role) and
-- the legacy bridge below, never a direct client write.
drop policy if exists staff_members_own_read on public.staff_members;
create policy staff_members_own_read on public.staff_members
for select to authenticated using (id = auth.uid());

drop policy if exists staff_members_admin_read on public.staff_members;
create policy staff_members_admin_read on public.staff_members
for select to authenticated using (public.is_admin());

revoke all on public.staff_members from anon, authenticated;
grant select on public.staff_members to authenticated;
grant all on public.staff_members to service_role;

-- ── seed the vocabulary for every existing club ─────────────────────────────
insert into public.staff_roles
  (tenant_id, code, name, can_manage_staff, can_operate_gate, sort_order)
select t.id, r.code, r.name, r.can_manage_staff, r.can_operate_gate, r.sort_order
from public.tenants t
cross join (values
  ('admin', 'Admin', true, true, 1),
  ('gatekeeper', 'Gatekeeper', false, true, 2)
) as r (code, name, can_manage_staff, can_operate_gate, sort_order)
on conflict (tenant_id, code) do nothing;

-- ── backfill the legacy rows ────────────────────────────────────────────────
-- Existing staff become members of the one club this deployment serves.
insert into public.staff_members (id, tenant_id, staff_role)
select p.id, '00000000-0000-0000-0000-000000000001', p.role
from public.profiles p
where p.role in ('admin', 'gatekeeper')
on conflict (id, tenant_id) do nothing;

-- Existing buyers become fans. A profile without an order has not bought
-- anything yet and is created by the buying flow when it does.
insert into public.fans (id)
select distinct o.user_id
from public.orders o
join public.profiles p on p.id = o.user_id
on conflict (id) do nothing;

-- ── the dual-write bridge ───────────────────────────────────────────────────
-- `profiles.role` is still the column the console and the Edge Function write.
-- Mirror it into the new table so the two cannot drift during the transition.
-- The bridge speaks only for the default club: the legacy column is global, and
-- this deployment serves one club until the tenancy rollout (0042+) and the RLS
-- rewrite (0045). Scoping the update to that club also keeps it from tripping
-- the composite role FK on a membership granted by a future club.
create or replace function public.sync_staff_member()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  -- The only club this deployment serves until the tenancy rollout (0042+).
  v_default_tenant uuid := '00000000-0000-0000-0000-000000000001';
begin
  if new.role in ('admin', 'gatekeeper') then
    update public.staff_members
       set staff_role = new.role,
           updated_at = now()
     where id = new.id
       and tenant_id = v_default_tenant;

    if not found then
      insert into public.staff_members (id, tenant_id, staff_role)
      values (new.id, v_default_tenant, new.role)
      on conflict (id, tenant_id) do update
        set staff_role = excluded.staff_role,
            updated_at = now();
    end if;
  else
    -- A demotion to customer removes every staff grant: the legacy role is
    -- global, so keeping a membership would contradict the column.
    delete from public.staff_members where id = new.id;
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_sync_staff_member on public.profiles;
create trigger profiles_sync_staff_member
after update of role on public.profiles
for each row execute function public.sync_staff_member();

-- ── provisioning seeds the vocabulary ───────────────────────────────────────
-- 0040's body, plus the role rows. Replacing (not duplicating) the function
-- keeps the signature stable for 0042, which extends it with settings.
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

  insert into public.staff_roles
    (tenant_id, code, name, can_manage_staff, can_operate_gate, sort_order)
  values
    (v_id, 'admin', 'Admin', true, true, 1),
    (v_id, 'gatekeeper', 'Gatekeeper', false, true, 2)
  on conflict (tenant_id, code) do nothing;

  return v_id;
end;
$$;
