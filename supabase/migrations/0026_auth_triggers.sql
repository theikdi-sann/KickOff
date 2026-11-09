-- 0026_auth_triggers — role guards + bootstrap admin helper.
-- handle_new_user already exists in 0002; this migration tightens the role
-- guard so the service role (and migrations run as postgres) may change roles.

create or replace function public.prevent_role_escalation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role is distinct from old.role
     and not public.is_admin()
     and coalesce(auth.jwt() ->> 'role', '') <> 'service_role'
     and session_user <> 'postgres' then
    raise exception 'Only admins may change a role' using errcode = '42501';
  end if;
  return new;
end;
$$;

-- Promote an existing profile by email. Callable with the service-role key only.
create or replace function public.grant_admin(p_email text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role'
     and session_user <> 'postgres' then
    raise exception 'Service role required' using errcode = '42501';
  end if;

  update public.profiles set role = 'admin' where lower(email) = lower(p_email);
  if not found then
    raise exception 'Profile not found for %', p_email using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.grant_admin(text) from public;
grant execute on function public.grant_admin(text) to service_role;

-- Bootstrap: promote the demo/operations account if it already exists.
update public.profiles set role = 'admin' where lower(email) = 'admin@xclub.app';
