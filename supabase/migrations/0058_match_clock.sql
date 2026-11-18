-- 0058 — the match clock.
--
-- One `pg_cron` job runs every minute. Each pass:
--   * opens a match that has kicked off (`upcoming → live`),
--   * closes a match two hours later (`upcoming/live → completed`),
--   * records the four matchday bells (kick-off, half-time, 15 minutes left,
--     full-time) exactly once per match.
--
-- Scores are never written here. A completed match without a result keeps an
-- unread full-time bell; the clock's job is the clock, not the scoreboard.
-- Postponed and cancelled fixtures are invisible to every statement below.

-- ── the bell ────────────────────────────────────────────────────────────────
create table if not exists public.match_notifications (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default public.current_tenant()
    references public.tenants (id) on delete cascade,
  match_id text not null references public.matches (id) on delete cascade,
  kind text not null
    check (kind in ('kickoff', 'half_time', 'near_end', 'full_time')),
  title text not null,
  body text not null,
  created_at timestamptz not null default now(),
  constraint match_notifications_match_kind_key unique (match_id, kind)
);

create index if not exists match_notifications_tenant_created_idx
  on public.match_notifications (tenant_id, created_at desc);

alter table public.match_notifications enable row level security;

drop policy if exists match_notifications_admin_read on public.match_notifications;
create policy match_notifications_admin_read on public.match_notifications
for select to authenticated
using (tenant_id = public.current_tenant() and public.is_admin());

grant select on public.match_notifications to authenticated;

-- Unread is per admin: one console clicking "read" must not clear another's
-- bell, and the full-time entry stays actionable until a result exists.
create table if not exists public.match_notification_reads (
  notification_id uuid not null
    references public.match_notifications (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (notification_id, user_id)
);

alter table public.match_notification_reads enable row level security;

drop policy if exists match_notification_reads_own on public.match_notification_reads;
create policy match_notification_reads_own on public.match_notification_reads
for all to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

grant select, insert, delete on public.match_notification_reads to authenticated;

-- ── the pass ────────────────────────────────────────────────────────────────
create or replace function public.record_match_clock(p_now timestamptz default now())
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inserted integer := 0;
begin
  -- Kick-off. Postponed and cancelled rows are excluded by the status filter.
  update public.matches
    set status = 'live',
        updated_at = p_now
    where status = 'upcoming'
      and kickoff_at <= p_now;

  -- Full-time: two hours after kickoff, matching the gate window (0027/0044).
  update public.matches
    set status = 'completed',
        updated_at = p_now
    where status in ('upcoming', 'live')
      and kickoff_at <= p_now - interval '120 minutes';

  -- The four bells. The 24-hour lookback stops a first deployment from
  -- replaying months of ancient fixtures; the unique key stops a re-run from
  -- replaying today's.
  insert into public.match_notifications (tenant_id, match_id, kind, title, body)
  select
    m.tenant_id,
    m.id,
    moment.kind,
    moment.title,
    moment.body
  from public.matches m
  cross join lateral (
    values
      ('kickoff',   m.kickoff_at,
       'Kick-off',
       'KickOff vs ' || m.opponent || ' has started.'),
      ('half_time', m.kickoff_at + interval '45 minutes',
       'Half-time',
       'Half-time — KickOff vs ' || m.opponent || '.'),
      ('near_end',  m.kickoff_at + interval '90 minutes',
       '15 minutes left',
       '15 minutes left — KickOff vs ' || m.opponent || '.'),
      ('full_time', m.kickoff_at + interval '120 minutes',
       'Full-time — enter the result',
       'Full-time — enter the result for KickOff vs ' || m.opponent || '.')
  ) as moment(kind, due_at, title, body)
  where m.status in ('upcoming', 'live', 'completed')
    and m.kickoff_at <= p_now
    and m.kickoff_at > p_now - interval '24 hours'
    and moment.due_at <= p_now
    and not exists (
      select 1
      from public.app_settings s
      where s.tenant_id = m.tenant_id
        and s.key = 'notifications_enabled'
        and s.value = 'false'::jsonb
    )
  on conflict (match_id, kind) do nothing;

  get diagnostics v_inserted = row_count;
  return v_inserted;
end;
$$;

revoke execute on function public.record_match_clock(timestamptz)
  from public, anon, authenticated;
grant execute on function public.record_match_clock(timestamptz)
  to service_role;

-- ── the schedule ────────────────────────────────────────────────────────────
select cron.unschedule('xclub-match-clock')
where exists (select 1 from cron.job where jobname = 'xclub-match-clock');

select cron.schedule(
  'xclub-match-clock',
  '* * * * *',
  $job$ select public.record_match_clock(); $job$
);
