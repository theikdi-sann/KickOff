-- 0009_tickets — issued passes with a unique QR nonce.
create table public.tickets (
  id text primary key default ('tkt_' || replace(gen_random_uuid()::text, '-', '')),
  order_id text not null references public.orders (id) on delete cascade,
  order_seat_id text not null references public.order_seats (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  match_id text not null references public.matches (id),
  seat_id text not null references public.seats (id),
  qr_nonce text not null unique default replace(gen_random_uuid()::text, '-', ''),
  status public.ticket_status not null default 'valid',
  issued_at timestamptz not null default now(),
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index tickets_user_id_idx on public.tickets (user_id);
create index tickets_match_id_idx on public.tickets (match_id);
create index tickets_order_id_idx on public.tickets (order_id);

alter table public.order_seats
  add constraint order_seats_ticket_id_fkey
  foreign key (ticket_id) references public.tickets (id) on delete set null;
