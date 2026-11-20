-- NFR-14 — availability is measured, not assumed.
--
-- `health` is the public readiness probe. A scheduled probe writes one row
-- per check; the monthly view turns those rows into the 99.5 % SLO. The table
-- is platform-only (RLS on, no policies). The probe itself is
-- `scripts/availability-probe.mjs`, so the same code runs in CI and on a
-- scheduler.

create table if not exists public.availability_probes (
  id bigserial primary key,
  checked_at timestamptz not null default now(),
  ok boolean not null,
  status integer,
  latency_ms integer check (latency_ms is null or latency_ms >= 0),
  source text not null default 'health'
);

create index if not exists availability_probes_checked_at_idx
  on public.availability_probes (checked_at desc);

alter table public.availability_probes enable row level security;

revoke all on table public.availability_probes from anon, authenticated;
grant select, insert, delete on table public.availability_probes to service_role;
grant usage, select on sequence public.availability_probes_id_seq to service_role;

create or replace view public.availability_monthly as
select
  date_trunc('month', checked_at) as month,
  count(*)::bigint as probes,
  count(*) filter (where ok)::bigint as ok_probes,
  round(100.0 * count(*) filter (where ok) / nullif(count(*), 0), 3) as availability_pct
from public.availability_probes
group by 1;

revoke all on public.availability_monthly from anon, authenticated;
grant select on public.availability_monthly to service_role;

notify pgrst, 'reload schema';
