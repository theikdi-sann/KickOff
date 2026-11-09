-- 0005_seats — individual seats generated from a zone's rows/layout.
-- `row_label` is used instead of `row` because ROW is a reserved SQL keyword.
create table public.seats (
  id text primary key default ('s_' || replace(gen_random_uuid()::text, '-', '')),
  zone_id text not null references public.zones (id) on delete cascade,
  row_label text not null,
  number integer not null check (number > 0),
  status public.seat_status not null default 'available',
  created_at timestamptz not null default now(),
  unique (zone_id, row_label, number)
);

create index seats_zone_id_idx on public.seats (zone_id);
create index seats_status_idx on public.seats (status);
