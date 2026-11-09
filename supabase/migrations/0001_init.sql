-- 0001_init — extensions, enums, helpers.
create extension if not exists pgcrypto;
create extension if not exists pg_cron;
create extension if not exists pg_net;
create extension if not exists pgtap;

create type public.match_status as enum ('upcoming', 'live', 'completed');
create type public.seat_status as enum ('available', 'sold', 'held');
create type public.order_status as enum ('pending', 'paid', 'failed', 'cancelled', 'refunded');
create type public.ticket_status as enum ('valid', 'used', 'void');
create type public.scan_result as enum ('valid', 'used', 'invalid', 'wrong_match');

-- Keep updated_at accurate on every mutation.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Admin is identified by the JWT app_metadata claim set from the server only.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin', false);
$$;

grant execute on function public.is_admin() to anon, authenticated, service_role;
