-- 0010_scan_events — append-only gate log. `undone_at` supports the 60s undo.
create table public.scan_events (
  id text primary key default ('se_' || replace(gen_random_uuid()::text, '-', '')),
  ticket_id text not null references public.tickets (id) on delete cascade,
  raw_hash text not null,
  result public.scan_result not null,
  gate_id text not null,
  admin_id uuid not null references auth.users (id),
  idempotency_key text not null unique,
  undone_at timestamptz,
  created_at timestamptz not null default now()
);

create index scan_events_ticket_id_idx on public.scan_events (ticket_id);
create index scan_events_created_at_idx on public.scan_events (created_at desc);
