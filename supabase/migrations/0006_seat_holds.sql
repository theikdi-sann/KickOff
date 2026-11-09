-- 0006_seat_holds — short-lived reservations.
-- `hold_group_id` groups the per-seat rows created by a single checkout.
create table public.seat_holds (
  id text primary key default ('h_' || replace(gen_random_uuid()::text, '-', '')),
  hold_group_id text not null,
  seat_id text not null references public.seats (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  expires_at timestamptz not null,
  released_at timestamptz,
  created_at timestamptz not null default now()
);

-- One active hold per seat. Predicate must stay immutable (no now()).
create unique index seat_holds_active_seat_idx
  on public.seat_holds (seat_id)
  where released_at is null;

create index seat_holds_group_idx on public.seat_holds (hold_group_id);
create index seat_holds_user_idx on public.seat_holds (user_id);
create index seat_holds_expires_idx on public.seat_holds (expires_at)
  where released_at is null;
