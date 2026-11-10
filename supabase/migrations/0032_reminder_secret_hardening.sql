-- 0032_reminder_secret_hardening — keep the reminder scheduler secret out of
-- the world-readable `app_settings` table, dedupe reminder windows, and use the
-- new secret in both cron jobs.
create table public.app_secrets (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

alter table public.app_secrets enable row level security;

-- Only the service role (Edge Functions) and the database owner (pg_cron) may
-- read secrets. Authenticated users can never select this table.
revoke all on table public.app_secrets from anon, authenticated;
grant select on table public.app_secrets to service_role;

insert into public.app_secrets (key, value)
values (
  'reminders_secret',
  encode(digest(gen_random_uuid()::text || clock_timestamp()::text, 'sha256'), 'hex')
)
on conflict (key) do nothing;

-- 0031 stored the secret as a readable app_settings row. Remove it.
delete from public.app_settings where key = 'reminders_secret';

-- Reschedule with one-hour windows so an hourly job sends exactly once per
-- match instead of once per qualifying hour.
select cron.unschedule('xclub-kickoff-reminders');
select cron.unschedule('xclub-kickoff-reminders-2h');

select cron.schedule(
  'xclub-kickoff-reminders',
  '0 * * * *',
  $job$
  select net.http_post(
    url := (select value ->> 'url' from public.app_settings where key = 'reminders_url'),
    body := jsonb_build_object(
      'matchId', m.id,
      'kickoffAt', m.kickoff_at
    ),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', coalesce(
        (select value from public.app_secrets where key = 'reminders_secret'),
        ''
      )
    )
  )
  from public.matches m
  where m.status = 'upcoming'
    and m.kickoff_at >= now() + interval '23 hours'
    and m.kickoff_at < now() + interval '24 hours'
    and exists (select 1 from public.app_settings where key = 'reminders_url');
  $job$
);

select cron.schedule(
  'xclub-kickoff-reminders-2h',
  '0 * * * *',
  $job$
  select net.http_post(
    url := (select value ->> 'url' from public.app_settings where key = 'reminders_url'),
    body := jsonb_build_object(
      'matchId', m.id,
      'kickoffAt', m.kickoff_at
    ),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', coalesce(
        (select value from public.app_secrets where key = 'reminders_secret'),
        ''
      )
    )
  )
  from public.matches m
  where m.status = 'upcoming'
    and m.kickoff_at >= now() + interval '1 hour'
    and m.kickoff_at < now() + interval '2 hours'
    and exists (select 1 from public.app_settings where key = 'reminders_url');
  $job$
);
