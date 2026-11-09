-- 0013_app_settings — key/value club configuration.
create table public.app_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);

create trigger app_settings_set_updated_at
before update on public.app_settings
for each row execute function public.set_updated_at();
