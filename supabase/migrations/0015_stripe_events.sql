-- 0015_stripe_events — webhook idempotency ledger.
create table public.stripe_events (
  id text primary key,
  type text not null,
  processed_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index stripe_events_type_idx on public.stripe_events (type);
