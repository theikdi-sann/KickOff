-- 0033_brand_rename — KickOff brand lock: club/stadium copy, demo account
-- domains, and internal cron job names. Older migrations stay untouched so the
-- hosted migration history remains stable; this migration brings live data
-- forward.
update public.app_settings
set value = '"KickOff"'::jsonb
where key = 'club_name';

alter table public.matches alter column venue set default 'KickOff Arena';
update public.matches set venue = 'KickOff Arena' where venue = 'XClub Arena';

update public.news_items
set title = replace(title, 'XClub', 'KickOff'),
    excerpt = replace(excerpt, 'XClub', 'KickOff'),
    body = replace(body, 'XClub', 'KickOff')
where title like '%XClub%' or excerpt like '%XClub%' or body like '%XClub%';

-- Demo account domains: @xclub.app / @xclub.test -> @kickoff.*
update auth.users
set email = replace(email, '@xclub.', '@kickoff.')
where email like '%@xclub.%';

-- provider_id is a UUID for the email provider in current Supabase versions, so
-- the email address lives in identity_data.
update auth.identities
set identity_data = jsonb_set(
      identity_data,
      '{email}',
      to_jsonb(replace(identity_data ->> 'email', '@xclub.', '@kickoff.'))
    )
where provider = 'email' and identity_data ->> 'email' like '%@xclub.%';

update public.profiles
set email = replace(email, '@xclub.', '@kickoff.')
where email like '%@xclub.%';

-- Rename internal scheduler jobs. Definitions match 0032.
select cron.unschedule('xclub-release-expired-holds');
select cron.unschedule('xclub-expire-pending-orders');
select cron.unschedule('xclub-kickoff-reminders');
select cron.unschedule('xclub-kickoff-reminders-2h');

select cron.schedule(
  'kickoff-release-expired-holds',
  '* * * * *',
  $job$
  update public.seat_holds
  set released_at = now()
  where released_at is null and expires_at <= now();
  $job$
);

select cron.schedule(
  'kickoff-expire-pending-orders',
  '* * * * *',
  $job$
  select public.expire_pending_orders();
  $job$
);

select cron.schedule(
  'kickoff-reminders',
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
  'kickoff-reminders-2h',
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
