-- 0008_order_seats — immutable snapshot of what was bought.
-- ticket_id is unique so a seat maps to at most one ticket; its FK is added
-- in 0009 once tickets exists.
create table public.order_seats (
  id text primary key default ('os_' || replace(gen_random_uuid()::text, '-', '')),
  order_id text not null references public.orders (id) on delete cascade,
  seat_id text not null references public.seats (id),
  ticket_id text unique,
  zone_name text not null,
  row_label text not null,
  number integer not null,
  price_satang integer not null check (price_satang >= 0),
  created_at timestamptz not null default now()
);

create index order_seats_order_id_idx on public.order_seats (order_id);
create index order_seats_seat_id_idx on public.order_seats (seat_id);
