-- 0014_device_tokens — push notification registrations.
create table public.device_tokens (
  id text primary key default ('dt_' || replace(gen_random_uuid()::text, '-', '')),
  user_id uuid not null references auth.users (id) on delete cascade,
  token text not null unique,
  platform text not null check (platform in ('ios', 'android', 'web')),
  created_at timestamptz not null default now()
);

create index device_tokens_user_id_idx on public.device_tokens (user_id);
