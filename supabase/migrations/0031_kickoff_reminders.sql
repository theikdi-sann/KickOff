-- 0031_kickoff_reminders — protect the scheduled reminder function and add the
-- two-hour reminder window (the original job only covered T-24h).
insert into public.app_settings (key, value)
values ('reminders_secret', '"xclub-reminders-2026-rotate-me"'::jsonb)
on conflict (key) do nothing;

select cron.unschedule('xclub-kickoff-reminders');

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
        (select value #>> '{}' from public.app_settings where key = 'reminders_secret'),
        ''
      )
    )
  )
  from public.matches m
  where m.status = 'upcoming'
    and m.kickoff_at between now() + interval '23 hours' and now() + interval '25 hours'
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
        (select value #>> '{}' from public.app_settings where key = 'reminders_secret'),
        ''
      )
    )
  )
  from public.matches m
  where m.status = 'upcoming'
    and m.kickoff_at between now() + interval '1 hour' and now() + interval '3 hours'
    and exists (select 1 from public.app_settings where key = 'reminders_url');
  $job$
);
