-- 0024_cron — housekeeping jobs (Supabase pg_cron).
select cron.schedule(
  'xclub-release-expired-holds',
  '* * * * *',
  $job$
  update public.seat_holds
  set released_at = now()
  where released_at is null and expires_at <= now();
  $job$
);

select cron.schedule(
  'xclub-expire-pending-orders',
  '* * * * *',
  $job$
  select public.expire_pending_orders();
  $job$
);

-- Hourly kickoff reminders. The target URL is configured in app_settings so the
-- same migration works locally and in production.
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
    headers := jsonb_build_object('Content-Type', 'application/json')
  )
  from public.matches m
  where m.status = 'upcoming'
    and m.kickoff_at between now() + interval '23 hours' and now() + interval '25 hours'
    and exists (select 1 from public.app_settings where key = 'reminders_url');
  $job$
);
