-- 0025_rate_limits — fixed-window counters for Edge Function throttling.
create table public.rate_limits (
  key text not null,
  window_start timestamptz not null,
  hits integer not null default 0 check (hits >= 0),
  primary key (key, window_start)
);

alter table public.rate_limits enable row level security;
-- No policies: only the service role may touch this table.

create or replace function public.consume_rate_limit(
  p_key text,
  p_window_seconds integer,
  p_max_hits integer
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_window timestamptz := to_timestamp(
    floor(extract(epoch from now()) / greatest(p_window_seconds, 1)) * greatest(p_window_seconds, 1)
  );
  v_hits integer;
begin
  if p_max_hits < 1 then
    raise exception 'p_max_hits must be positive' using errcode = '22023';
  end if;

  insert into public.rate_limits (key, window_start, hits)
  values (p_key, v_window, 1)
  on conflict (key, window_start) do update
  set hits = public.rate_limits.hits + 1
  returning hits into v_hits;

  -- Opportunistic cleanup of windows older than a day.
  delete from public.rate_limits where window_start < now() - interval '1 day';

  return v_hits <= p_max_hits;
end;
$$;

revoke all on function public.consume_rate_limit(text, integer, integer) from public;
grant execute on function public.consume_rate_limit(text, integer, integer) to service_role;
