-- REQ-046 / NFR-10 — per-club roles with a closed capability catalogue.
--
-- Built-ins stay immutable: `admin` holds all ten, `gatekeeper` holds
-- `operate_gate`. A club may add roles by writing rows, never a migration.
-- Authorization reads capabilities, not role names:
--   * `has_capability(name)` is the only role predicate;
--   * `is_admin()` means "all ten capabilities", so a custom full role is
--     equivalent to the built-in admin;
--   * `is_staff()` is any membership; `is_gate_operator()` is operate_gate.

alter table public.staff_roles
  add column if not exists is_system boolean not null default false;
alter table public.staff_roles
  add column if not exists active boolean not null default true;

create table if not exists public.staff_role_capabilities (
  tenant_id uuid not null,
  role_code text not null,
  capability text not null check (capability in (
    'manage_staff', 'operate_gate', 'manage_matches', 'manage_venues',
    'publish_news', 'refund_orders', 'read_audit', 'manage_settings',
    'export_data', 'view_reports'
  )),
  primary key (tenant_id, role_code, capability),
  foreign key (tenant_id, role_code)
    references public.staff_roles (tenant_id, code) on delete cascade
);

alter table public.staff_role_capabilities enable row level security;
revoke all on public.staff_role_capabilities from anon, authenticated;
grant select on public.staff_role_capabilities to authenticated;
grant all on public.staff_role_capabilities to service_role;

-- Seed the closed catalogue for every existing role row.
insert into public.staff_role_capabilities (tenant_id, role_code, capability)
select r.tenant_id, r.code, c.capability
from public.staff_roles r
cross join (values
  ('manage_staff'), ('operate_gate'), ('manage_matches'), ('manage_venues'),
  ('publish_news'), ('refund_orders'), ('read_audit'), ('manage_settings'),
  ('export_data'), ('view_reports')
) as c (capability)
where r.code = 'admin'
on conflict do nothing;

insert into public.staff_role_capabilities (tenant_id, role_code, capability)
select r.tenant_id, r.code, 'operate_gate'
from public.staff_roles r
where r.code = 'gatekeeper'
on conflict do nothing;

update public.staff_roles set is_system = true where code in ('admin', 'gatekeeper');

-- The single capability predicate.
create or replace function public.has_capability(p_capability text)
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
      on r.tenant_id = m.tenant_id and r.code = m.staff_role and r.active
    join public.staff_role_capabilities c
      on c.tenant_id = m.tenant_id and c.role_code = m.staff_role
    where m.id = auth.uid()
      and m.tenant_id = public.current_tenant()
      and c.capability = p_capability
  );
$$;

grant execute on function public.has_capability(text) to anon, authenticated, service_role;

-- `is_admin()` becomes "holds every capability", not a role name.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select (
    select count(distinct c.capability)
    from public.staff_members m
    join public.staff_roles r
      on r.tenant_id = m.tenant_id and r.code = m.staff_role and r.active
    join public.staff_role_capabilities c
      on c.tenant_id = m.tenant_id and c.role_code = m.staff_role
    where m.id = auth.uid()
      and m.tenant_id = public.current_tenant()
  ) = 10;
$$;

create or replace function public.is_gate_operator()
returns boolean
language sql
stable
security definer
set search_path = public
as $$ select public.has_capability('operate_gate'); $$;

-- RLS: capabilities grant the writes; the built-in admin keeps all of them.
drop policy if exists matches_capability_write on public.matches;
create policy matches_capability_write on public.matches
for all to authenticated
using (public.has_capability('manage_matches') and tenant_id = public.current_tenant())
with check (public.has_capability('manage_matches') and tenant_id = public.current_tenant());

drop policy if exists zones_capability_write on public.zones;
create policy zones_capability_write on public.zones
for all to authenticated
using (public.has_capability('manage_matches') and tenant_id = public.current_tenant())
with check (public.has_capability('manage_matches') and tenant_id = public.current_tenant());

drop policy if exists seats_capability_write on public.seats;
create policy seats_capability_write on public.seats
for all to authenticated
using (public.has_capability('manage_matches') and tenant_id = public.current_tenant())
with check (public.has_capability('manage_matches') and tenant_id = public.current_tenant());

drop policy if exists prices_capability_write on public.match_zone_prices;
create policy prices_capability_write on public.match_zone_prices
for all to authenticated
using (public.has_capability('manage_matches') and tenant_id = public.current_tenant())
with check (public.has_capability('manage_matches') and tenant_id = public.current_tenant());

drop policy if exists venues_capability_write on public.venues;
create policy venues_capability_write on public.venues
for all to authenticated
using (public.has_capability('manage_venues') and tenant_id = public.current_tenant())
with check (public.has_capability('manage_venues') and tenant_id = public.current_tenant());

drop policy if exists venue_zones_capability_write on public.venue_zones;
create policy venue_zones_capability_write on public.venue_zones
for all to authenticated
using (public.has_capability('manage_venues') and tenant_id = public.current_tenant())
with check (public.has_capability('manage_venues') and tenant_id = public.current_tenant());

drop policy if exists venue_seats_capability_write on public.venue_seats;
create policy venue_seats_capability_write on public.venue_seats
for all to authenticated
using (public.has_capability('manage_venues') and tenant_id = public.current_tenant())
with check (public.has_capability('manage_venues') and tenant_id = public.current_tenant());

drop policy if exists news_capability_write on public.news_items;
create policy news_capability_write on public.news_items
for all to authenticated
using (public.has_capability('publish_news') and tenant_id = public.current_tenant())
with check (public.has_capability('publish_news') and tenant_id = public.current_tenant());

drop policy if exists settings_capability_write on public.app_settings;
create policy settings_capability_write on public.app_settings
for all to authenticated
using (public.has_capability('manage_settings') and tenant_id = public.current_tenant())
with check (public.has_capability('manage_settings') and tenant_id = public.current_tenant());

drop policy if exists gates_capability_write on public.gates;
create policy gates_capability_write on public.gates
for all to authenticated
using (public.has_capability('manage_venues') and tenant_id = public.current_tenant())
with check (public.has_capability('manage_venues') and tenant_id = public.current_tenant());

drop policy if exists audit_capability_read on public.audit_logs;
create policy audit_capability_read on public.audit_logs
for select to authenticated
using (public.has_capability('read_audit') and tenant_id = public.current_tenant());

drop policy if exists audit_capability_insert on public.audit_logs;
create policy audit_capability_insert on public.audit_logs
for insert to authenticated
with check (public.is_staff() and tenant_id = public.current_tenant());

drop policy if exists refunds_capability_read on public.refunds;
create policy refunds_capability_read on public.refunds
for select to authenticated
using (public.has_capability('refund_orders') and tenant_id = public.current_tenant());

drop policy if exists staff_members_capability_read on public.staff_members;
create policy staff_members_capability_read on public.staff_members
for select to authenticated
using (public.has_capability('manage_staff') and tenant_id = public.current_tenant());

drop policy if exists staff_roles_tenant_read on public.staff_roles;
create policy staff_roles_tenant_read on public.staff_roles
for select to authenticated
using (tenant_id = public.current_tenant());

-- ── role CRUD ────────────────────────────────────────────────────────────────
create or replace function public.admin_create_role(
  p_code text,
  p_name text,
  p_capabilities text[]
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant uuid := public.current_tenant();
  v_cap text;
begin
  if not public.has_capability('manage_staff') then
    raise exception 'manage_staff required' using errcode = '42501';
  end if;
  if p_code !~ '^[a-z][a-z0-9_]{1,30}$' or p_code in ('admin', 'gatekeeper', 'customer') then
    raise exception 'Reserved or invalid role code' using errcode = '22023';
  end if;
  if exists (select 1 from public.staff_roles where tenant_id = v_tenant and code = p_code) then
    raise exception 'Role already exists' using errcode = '23505';
  end if;
  if coalesce(array_length(p_capabilities, 1), 0) = 0 then
    raise exception 'A role needs at least one capability' using errcode = '22023';
  end if;
  foreach v_cap in array p_capabilities loop
    if v_cap not in ('manage_staff','operate_gate','manage_matches','manage_venues',
                     'publish_news','refund_orders','read_audit','manage_settings',
                     'export_data','view_reports') then
      raise exception 'Unknown capability %', v_cap using errcode = '22023';
    end if;
    if not public.has_capability(v_cap) then
      raise exception 'Cannot grant a capability you do not hold: %', v_cap using errcode = '42501';
    end if;
  end loop;

  insert into public.staff_roles (tenant_id, code, name, is_system, active, sort_order)
  values (v_tenant, p_code, btrim(p_name), false, true,
          coalesce((select max(sort_order) + 1 from public.staff_roles where tenant_id = v_tenant), 1));

  insert into public.staff_role_capabilities (tenant_id, role_code, capability)
  select v_tenant, p_code, unnest(p_capabilities);

  insert into public.audit_logs (actor_id, tenant_id, action, entity, entity_id, metadata)
  values (auth.uid(), v_tenant, 'rbac.role.create', 'staff_roles', p_code,
          jsonb_build_object('capabilities', to_jsonb(p_capabilities)));

  return jsonb_build_object('code', p_code, 'capabilities', to_jsonb(p_capabilities));
end;
$$;

create or replace function public.admin_update_role(
  p_code text,
  p_name text,
  p_capabilities text[],
  p_active boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant uuid := public.current_tenant();
  v_cap text;
begin
  if not public.has_capability('manage_staff') then
    raise exception 'manage_staff required' using errcode = '42501';
  end if;
  if exists (select 1 from public.staff_roles where tenant_id = v_tenant and code = p_code and is_system) then
    raise exception 'Built-in roles are immutable' using errcode = '22023';
  end if;
  if not exists (select 1 from public.staff_roles where tenant_id = v_tenant and code = p_code) then
    raise exception 'Role not found' using errcode = 'P0002';
  end if;
  foreach v_cap in array p_capabilities loop
    if not public.has_capability(v_cap) then
      raise exception 'Cannot grant a capability you do not hold: %', v_cap using errcode = '42501';
    end if;
  end loop;

  update public.staff_roles
  set name = btrim(p_name), active = p_active
  where tenant_id = v_tenant and code = p_code;

  delete from public.staff_role_capabilities where tenant_id = v_tenant and role_code = p_code;
  insert into public.staff_role_capabilities (tenant_id, role_code, capability)
  select v_tenant, p_code, unnest(p_capabilities);

  insert into public.audit_logs (actor_id, tenant_id, action, entity, entity_id, metadata)
  values (auth.uid(), v_tenant, 'rbac.role.update', 'staff_roles', p_code,
          jsonb_build_object('capabilities', to_jsonb(p_capabilities), 'active', p_active));

  return jsonb_build_object('code', p_code, 'active', p_active, 'capabilities', to_jsonb(p_capabilities));
end;
$$;

create or replace function public.admin_delete_role(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant uuid := public.current_tenant();
begin
  if not public.has_capability('manage_staff') then
    raise exception 'manage_staff required' using errcode = '42501';
  end if;
  if exists (select 1 from public.staff_roles where tenant_id = v_tenant and code = p_code and is_system) then
    raise exception 'Built-in roles are immutable' using errcode = '22023';
  end if;
  if exists (select 1 from public.staff_members where tenant_id = v_tenant and staff_role = p_code) then
    raise exception 'Role is still assigned; deactivate it instead' using errcode = 'P0001';
  end if;
  delete from public.staff_roles where tenant_id = v_tenant and code = p_code;
  if not found then raise exception 'Role not found' using errcode = 'P0002'; end if;
  insert into public.audit_logs (actor_id, tenant_id, action, entity, entity_id)
  values (auth.uid(), v_tenant, 'rbac.role.delete', 'staff_roles', p_code);
  return jsonb_build_object('deleted', p_code);
end;
$$;

revoke all on function public.admin_create_role(text,text,text[]) from public, anon;
revoke all on function public.admin_update_role(text,text,text[],boolean) from public, anon;
revoke all on function public.admin_delete_role(text) from public, anon;
grant execute on function public.admin_create_role(text,text,text[]) to authenticated, service_role;
grant execute on function public.admin_update_role(text,text,text[],boolean) to authenticated, service_role;
grant execute on function public.admin_delete_role(text) to authenticated, service_role;

notify pgrst, 'reload schema';

-- ── assignment ──────────────────────────────────────────────────────────────
-- Membership only; the Edge function writes the claim and compensates on
-- failure (RBAC-7). `customer` removes the membership.
create or replace function public.admin_assign_role(
  p_user_id uuid,
  p_role text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant uuid := public.current_tenant();
  v_current text;
  v_cap text;
  v_caps text[] := '{}'::text[];
  v_other_managers int;
begin
  if not public.has_capability('manage_staff') then
    raise exception 'manage_staff required' using errcode = '42501';
  end if;

  select staff_role into v_current
  from public.staff_members
  where id = p_user_id and tenant_id = v_tenant;

  if p_role <> 'customer' then
    select coalesce(array_agg(capability), '{}'::text[]) into v_caps
    from public.staff_role_capabilities c
    join public.staff_roles r
      on r.tenant_id = c.tenant_id and r.code = c.role_code
    where c.tenant_id = v_tenant and c.role_code = p_role and r.active;
    if coalesce(array_length(v_caps, 1), 0) = 0 then
      raise exception 'Role not found or inactive' using errcode = 'P0002';
    end if;
    foreach v_cap in array v_caps loop
      if not public.has_capability(v_cap) then
        raise exception 'Cannot grant a capability you do not hold: %', v_cap using errcode = '42501';
      end if;
    end loop;
  end if;

  if p_user_id = auth.uid()
     and not (p_role <> 'customer' and 'manage_staff' = any(v_caps)) then
    raise exception 'You cannot demote your own account' using errcode = 'P0001';
  end if;

  if v_current is not null
     and exists (
       select 1 from public.staff_role_capabilities
       where tenant_id = v_tenant and role_code = v_current and capability = 'manage_staff'
     )
     and not ('manage_staff' = any(v_caps)) then
    select count(*) into v_other_managers
    from public.staff_members m
    join public.staff_role_capabilities c
      on c.tenant_id = m.tenant_id and c.role_code = m.staff_role
    join public.staff_roles r on r.tenant_id = m.tenant_id and r.code = m.staff_role and r.active
    where m.tenant_id = v_tenant and m.id <> p_user_id and c.capability = 'manage_staff';
    if v_other_managers = 0 then
      raise exception 'At least one manage_staff holder must remain' using errcode = 'P0001';
    end if;
  end if;

  if p_role = 'customer' then
    delete from public.staff_members where id = p_user_id and tenant_id = v_tenant;
  else
    insert into public.staff_members (id, tenant_id, staff_role, granted_by)
    values (p_user_id, v_tenant, p_role, auth.uid())
    on conflict (id, tenant_id) do update set staff_role = excluded.staff_role;
  end if;

  insert into public.audit_logs (actor_id, tenant_id, action, entity, entity_id, metadata)
  values (auth.uid(), v_tenant, 'rbac.role.assign', 'staff_members', p_user_id::text,
          jsonb_build_object('role', p_role, 'capabilities', to_jsonb(v_caps)));

  return jsonb_build_object('role', p_role, 'capabilities', to_jsonb(v_caps));
end;
$$;

revoke all on function public.admin_assign_role(uuid, text) from public, anon;
grant execute on function public.admin_assign_role(uuid, text) to authenticated, service_role;


-- New clubs get their built-in capabilities with their role vocabulary.
create or replace function public.seed_builtin_role_capabilities()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.code = 'admin' then
    insert into public.staff_role_capabilities (tenant_id, role_code, capability)
    select new.tenant_id, new.code, c.capability
    from (values
      ('manage_staff'), ('operate_gate'), ('manage_matches'), ('manage_venues'),
      ('publish_news'), ('refund_orders'), ('read_audit'), ('manage_settings'),
      ('export_data'), ('view_reports')
    ) as c (capability)
    on conflict do nothing;
  elsif new.code = 'gatekeeper' then
    insert into public.staff_role_capabilities (tenant_id, role_code, capability)
    values (new.tenant_id, new.code, 'operate_gate')
    on conflict do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists staff_roles_seed_capabilities on public.staff_roles;
create trigger staff_roles_seed_capabilities
after insert on public.staff_roles
for each row execute function public.seed_builtin_role_capabilities();

-- The club archive/erase registries now include the capability rows.
create or replace function public.export_tenant(p_tenant_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_slug text;
  -- The single registry of what a club's archive contains: every
  -- tenant-scoped table (the club's own row is added below — `tenants` has no
  -- `tenant_id` column to scope by).
  v_tables text[] := array[
    'app_settings',
    'audit_logs',
    'gates',
    'match_gates',
    'match_notifications',
    'match_zone_prices',
    'venue_seats',
    'venue_zones',
    'matches',
    'news_items',
    'order_seats',
    'orders',
    'refunds',
    'scan_events',
    'seat_holds',
    'seats',
    'staff_members',
    'staff_role_capabilities',
    'staff_roles',
    'stripe_events',
    'tickets',
    'venues',
    'zones'
  ];
  v_name text;
  v_data jsonb;
  v_tables_out jsonb := '{}'::jsonb;
  v_counts jsonb;
begin
  -- An unknown club raises, it does not export a silent empty archive.
  select slug into v_slug from public.tenants where id = p_tenant_id;
  if v_slug is null then
    raise exception 'Tenant not found' using errcode = 'P0002';
  end if;

  foreach v_name in array v_tables loop
    execute format(
      'select coalesce(jsonb_agg(to_jsonb(t)), ''[]''::jsonb)
         from public.%I t where t.tenant_id = $1',
      v_name
    ) into v_data using p_tenant_id;
    v_tables_out := jsonb_set(v_tables_out, array[v_name], v_data);
  end loop;

  -- The club's own row completes the archive.
  select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb)
    into v_data
  from public.tenants t where t.id = p_tenant_id;
  v_tables_out := jsonb_set(v_tables_out, array['tenants'], v_data);

  select jsonb_object_agg(key, jsonb_array_length(value))
    into v_counts
  from jsonb_each(v_tables_out);

  insert into public.audit_logs (tenant_id, actor_id, action, entity, entity_id, metadata)
  values (
    p_tenant_id,
    null,
    'tenant.export',
    'tenants',
    p_tenant_id,
    jsonb_build_object('tables', v_counts, 'exported_by', 'export_tenant')
  );

  return jsonb_build_object(
    'tenant_id', p_tenant_id,
    'slug', v_slug,
    'generated_at', now(),
    'counts', v_counts,
    'tables', v_tables_out
  );
end;
$$;

create or replace function public.erase_tenant(p_tenant_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_offboarded boolean;
  -- Children before parents: the composite foreign keys cascade, but the
  -- explicit order is what makes each count an honest number rather than a
  -- cascade's side effect. Children of children are already gone when their
  -- parent's delete runs.
  v_tables text[] := array[
    'seat_holds',
    'scan_events',
    'tickets',
    'order_seats',
    'refunds',
    'orders',
    'match_notifications',
    'match_gates',
    'gates',
    'match_zone_prices',
    'zones',
    'seats',
    'matches',
    'news_items',
    'venue_seats',
    'venue_zones',
    'app_settings',
    'staff_members',
    'staff_role_capabilities',
    'staff_roles',
    'stripe_events',
    'venues',
    -- The club's own audit trail is purged last, and the tombstone rows are
    -- exempt: the record that the erase happened must survive the erase.
    'audit_logs'
  ];
  v_name text;
  v_deleted jsonb := '{}'::jsonb;
  v_rows bigint;
begin
  select exists(
    select 1 from public.tenants
    where id = p_tenant_id and offboarded_at is not null
  ) into v_offboarded;
  if not v_offboarded then
    -- Unknown club, or a club nobody offboarded: the same refusal — the
    -- exit procedure did not run, so there is nothing to erase.
    raise exception 'Tenant not offboarded' using errcode = 'P0001';
  end if;

  -- The append-only scan log is purged through its sanctioned path, not
  -- around it: the session flag plus the owner role the trigger demands
  -- (0044). The definer runs as the owner, the flag is the explicit intent.
  perform set_config('kickoff.scan_events_maintenance', 'on', true);

  foreach v_name in array v_tables loop
    if v_name = 'audit_logs' then
      delete from public.audit_logs
      where tenant_id = p_tenant_id and action <> 'tenant.erased';
    else
      execute format('delete from public.%I where tenant_id = $1', v_name)
        using p_tenant_id;
    end if;
    get diagnostics v_rows = row_count;
    v_deleted := jsonb_set(v_deleted, array[v_name], to_jsonb(v_rows));
  end loop;

  -- The `tenants` row survives as the tombstone: the club existed, the erase
  -- happened. Everything the club configured is gone; the name and slug stay
  -- so the record can be read.
  update public.tenants
  set logo_url = null,
      primary_color = '',
      stripe_account_id = null,
      erased_at = now(),
      updated_at = now()
  where id = p_tenant_id;

  -- One tombstone per club: a re-erase does not add a second one.
  if not exists (
    select 1 from public.audit_logs
    where tenant_id = p_tenant_id and action = 'tenant.erased'
  ) then
    insert into public.audit_logs (tenant_id, actor_id, action, entity, entity_id, metadata)
    values (
      p_tenant_id, null, 'tenant.erased', 'tenants', p_tenant_id::text,
      jsonb_build_object('deleted', v_deleted, 'erased_by', 'erase_tenant')
    );
  end if;

  return jsonb_build_object(
    'tenant_id', p_tenant_id,
    'erased_at', now(),
    'deleted', v_deleted
  );
end;
$$;
