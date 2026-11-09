-- 0004_zones — priced stands per fixture. Money is integer satang.
create table public.zones (
  id text primary key default ('z_' || replace(gen_random_uuid()::text, '-', '')),
  match_id text not null references public.matches (id) on delete cascade,
  name text not null,
  description text not null default '',
  price_satang integer not null check (price_satang >= 0),
  color text not null default '#22C55E',
  rows text[] not null default '{}'::text[],
  seats_per_row integer not null check (seats_per_row > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (match_id, name)
);

create index zones_match_id_idx on public.zones (match_id);

create trigger zones_set_updated_at
before update on public.zones
for each row execute function public.set_updated_at();
