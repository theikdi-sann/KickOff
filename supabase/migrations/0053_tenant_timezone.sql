-- 0053 — C8.2c: the club's time zone.
--
-- Every kickoff, reminder and formatted date is a wall-clock time somewhere.
-- `tenants.locale`/`currency` already say how a club speaks and charges
-- (0040); this says where it lives, so a club in London does not see 18:00
-- Bangkok. The display formatters take it from the club (C8.2c/C8.2d) —
-- `CLUB_TIMEZONE` stays the *default*, not the truth.
--
-- The value is validated where it is written (`provision_tenant` against
-- `pg_timezone_names`), not by a CHECK constraint: a constraint that raises
-- would abort the insert with a database error instead of the named argument
-- error the helper already gives its other parameters.

alter table public.tenants
  add column if not exists timezone text not null default 'Asia/Bangkok';

-- Members may read the branding columns (0040's column grant) — the time
-- zone is one of them: the app renders kickoff times with it.
grant select (id, name, slug, currency, locale, timezone, logo_url, primary_color, status)
  on public.tenants to anon, authenticated;

-- `create or replace` cannot change an argument list — it would create a
-- second overload and leave the 4-arg one callable beside the new one.
drop function if exists public.provision_tenant(text, text, text, text);

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

-- Provisioning is a platform operation, never a client call.
revoke all on function public.provision_tenant(text, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.provision_tenant(text, text, text, text, text)
  to service_role;
