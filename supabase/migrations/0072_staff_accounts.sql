-- RBAC-9 — staff accounts are created by an administrator, never promoted
-- from a customer.
--
-- `admin_assign_role` used to insert a membership for a user who had none, so
-- the Users screen could turn any customer into staff through the role
-- selector. A customer holds no `staff_members` row by definition; staff are
-- provisioned deliberately with an e-mail, an initial password and a role.
--
-- The update RPC now refuses a customer → staff move. The creation path is a
-- separate, service-only RPC that the `admin-users` Edge Function calls after
-- it has created the auth user. It re-checks the actor's capabilities and the
-- no-escalation rule in the database, so the Edge layer is not the only guard.

-- ── the update path refuses to promote a customer ───────────────────────────
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

  -- RBAC-9: a customer has no membership; creating one is the staff-creation
  -- path, not a role update.
  if v_current is null and p_role <> 'customer' then
    raise exception 'customer_not_staff' using errcode = 'P0001';
  end if;

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

-- ── the creation path (service role only) ───────────────────────────────────
-- The Edge Function calls this with the service client after creating the auth
-- user. It is not callable by a signed-in browser session: a customer cannot
-- use it, and even an admin must go through `admin-users` (which checks
-- `manage_staff` and writes the claim).
create or replace function public.admin_create_staff_member(
  p_actor_id uuid,
  p_tenant_id uuid,
  p_user_id uuid,
  p_role text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caps text[] := '{}'::text[];
  v_actor_caps text[] := '{}'::text[];
  v_cap text;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role'
     and session_user <> 'postgres' then
    raise exception 'Service role required' using errcode = '42501';
  end if;

  if p_role = 'customer' then
    raise exception 'customer is not a creatable staff role' using errcode = '22023';
  end if;

  if not exists (select 1 from public.profiles where id = p_user_id) then
    raise exception 'Profile not found' using errcode = 'P0002';
  end if;

  if exists (
    select 1 from public.staff_members
    where id = p_user_id and tenant_id = p_tenant_id
  ) then
    raise exception 'staff_member_exists' using errcode = 'P0001';
  end if;

  select coalesce(array_agg(capability), '{}'::text[]) into v_caps
  from public.staff_role_capabilities c
  join public.staff_roles r
    on r.tenant_id = c.tenant_id and r.code = c.role_code
  where c.tenant_id = p_tenant_id and c.role_code = p_role and r.active;
  if coalesce(array_length(v_caps, 1), 0) = 0 then
    raise exception 'Role not found or inactive' using errcode = 'P0002';
  end if;

  -- The actor must be a manager at this club and may only hand out capabilities
  -- it holds itself.
  select coalesce(array_agg(c.capability), '{}'::text[]) into v_actor_caps
  from public.staff_members m
  join public.staff_role_capabilities c
    on c.tenant_id = m.tenant_id and c.role_code = m.staff_role
  join public.staff_roles r
    on r.tenant_id = m.tenant_id and r.code = m.staff_role and r.active
  where m.id = p_actor_id and m.tenant_id = p_tenant_id;

  if not ('manage_staff' = any(v_actor_caps)) then
    raise exception 'manage_staff required' using errcode = '42501';
  end if;

  foreach v_cap in array v_caps loop
    if not (v_cap = any(v_actor_caps)) then
      raise exception 'Cannot grant a capability you do not hold: %', v_cap using errcode = '42501';
    end if;
  end loop;

  insert into public.staff_members (id, tenant_id, staff_role, granted_by)
  values (p_user_id, p_tenant_id, p_role, p_actor_id);

  insert into public.audit_logs (actor_id, tenant_id, action, entity, entity_id, metadata)
  values (p_actor_id, p_tenant_id, 'admin.user.create', 'profiles', p_user_id::text,
          jsonb_build_object('role', p_role, 'capabilities', to_jsonb(v_caps)));

  return jsonb_build_object('role', p_role, 'capabilities', to_jsonb(v_caps));
end;
$$;

revoke all on function public.admin_create_staff_member(uuid, uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.admin_create_staff_member(uuid, uuid, uuid, text)
  to service_role;

notify pgrst, 'reload schema';
