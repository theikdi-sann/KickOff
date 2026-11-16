-- C7.4 — the role bridge sweep: authority moves off `profiles.role`.
--
-- `0041` left a dual-write bridge: `profiles.role` was mirrored into the
-- default club's membership by a trigger, and the console displayed it.
-- `0045` moved the database itself onto the membership (`is_admin()`,
-- `is_staff()`, `is_gate_operator()` read `staff_members` + `staff_roles`),
-- which left the legacy column as a *display* projection nothing trusted.
--
-- Two readers still took it as the truth, and this cycle moves both:
--   * the staff console listed and filtered people by `profiles.role`;
--   * the `admin-users` Edge Function read and wrote it.
-- With them gone, `0048` can drop the column, its check constraint and the
-- dual-write trigger without breaking a reader.
--
-- The third writer of the column is `grant_admin()` — the service-role
-- promotion helper from 0026. It promoted through the legacy column, so the
-- membership arrived by the bridge and the JWT claim never moved: a
-- promotion half-applied (the database said admin, the Edge guards said
-- customer). It now grants the membership the database reads and merges the
-- claim the Edge guards read, in one call.
--
-- The column itself stays until `0048`. This file changes no table shape.

-- ── the promotion helper ───────────────────────────────────────────────────
create or replace function public.grant_admin(p_email text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_tenant uuid;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role'
     and session_user <> 'postgres' then
    raise exception 'Service role required' using errcode = '42501';
  end if;

  select id into v_id
  from public.profiles
  where lower(email) = lower(p_email);

  if v_id is null then
    raise exception 'Profile not found for %', p_email using errcode = 'P0002';
  end if;

  -- The club this promotion applies to: the caller's club, and the default
  -- club when the caller carries no tenant claim.
  v_tenant := public.current_tenant();

  -- The membership is the authority the database reads.
  insert into public.staff_members (id, tenant_id, staff_role)
  values (v_id, v_tenant, 'admin')
  on conflict (id, tenant_id) do update
    set staff_role = excluded.staff_role,
        updated_at = now();

  -- The claim is what every Edge Function guard reads. Merge it — never
  -- replace it, or a claim another tier owns (a tenant, say) would be lost.
  update auth.users
     set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb)
                             || jsonb_build_object('role', 'admin')
   where id = v_id;
end;
$$;

revoke all on function public.grant_admin(text) from public;
grant execute on function public.grant_admin(text) to service_role;
