-- 0007_orders — checkout attempts. Amounts are integer satang.
create table public.orders (
  id text primary key default ('ord_' || replace(gen_random_uuid()::text, '-', '')),
  user_id uuid not null references auth.users (id) on delete cascade,
  match_id text not null references public.matches (id),
  amount_satang integer not null check (amount_satang >= 0),
  status public.order_status not null default 'pending',
  stripe_session_id text unique,
  payment_intent_id text unique,
  payment_ref text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  paid_at timestamptz
);

create index orders_user_id_idx on public.orders (user_id);
create index orders_match_id_idx on public.orders (match_id);
create index orders_status_idx on public.orders (status);

create trigger orders_set_updated_at
before update on public.orders
for each row execute function public.set_updated_at();
