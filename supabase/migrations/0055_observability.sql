-- 0055_observability — C10.1: the durable error record, its retention and
-- the payment reconciliation sweep (GAP-04).
--
-- The structured logs (C4.11) and the `metrics` snapshot already existed;
-- what did not is the part that finds incidents before users do:
--
--   * `error_events` — one row per server-side failure, carrying the same
--     `request_id` the response envelope and the `x-request-id` header
--     carry: one id across every tier, without a new tracing protocol;
--   * a retention job — an incident table that grows forever is an incident
--     nobody queries;
--   * `xclub-reconcile-payments` — the sweep `stripe-webhook`'s own comment
--     names (ADR-003 §3): a payment captured for a suspended club, or a lost
--     webhook, leaves the order unsettled, and until this job that needed a
--     human to notice by luck.
--
-- The alert channel is `ALERT_WEBHOOK_URL` (Edge env, optional): the row is
-- the source of truth, the webhook is the shout.

-- ── the record ───────────────────────────────────────────────────────────────
create table if not exists public.error_events (
  id uuid primary key default gen_random_uuid(),
  -- The id the client saw in the envelope and the response header; null for
  -- incidents no request produced (the sweep).
  request_id text,
  code text not null,
  status integer,
  message text not null,
  source text not null,
  context jsonb,
  created_at timestamptz not null default now()
);

create index if not exists error_events_created_at_idx
  on public.error_events (created_at desc);
create index if not exists error_events_code_idx
  on public.error_events (code, created_at desc);

-- RLS on, no policies: the Edge recorder writes and the metrics snapshot
-- reads with the service role; no client reaches (or fills) the platform's
-- incident history.
alter table public.error_events enable row level security;
revoke all on table public.error_events from anon, authenticated;
grant all on table public.error_events to service_role;

-- ── the sweep's scheduler secret ─────────────────────────────────────────────
-- Generated, never a committed literal, and kept out of the world-readable
-- `app_settings` — the lesson of 0032 applied from the start here.
insert into public.app_secrets (key, value)
values (
  'reconciliation_secret',
  encode(digest(gen_random_uuid()::text || clock_timestamp()::text, 'sha256'), 'hex')
)
on conflict (key) do nothing;

-- ── retention ────────────────────────────────────────────────────────────────
select cron.unschedule(jobid) from cron.job where jobname = 'xclub-prune-error-events';
select cron.schedule(
  'xclub-prune-error-events',
  '17 4 * * *',
  $job$
  delete from public.error_events
  where created_at < now() - interval '30 days';
  $job$
);

-- ── the reconciliation sweep ─────────────────────────────────────────────────
-- Every fifteen minutes, with a ten-minute grace so the webhook gets first
-- refusal on an order. The target URL is configuration (`app_settings`), so
-- the same migration works locally and hosted — the job is a no-op until the
-- deployment sets `reconciliation_url` (RUNBOOK §2).
select cron.unschedule(jobid) from cron.job where jobname = 'xclub-reconcile-payments';
select cron.schedule(
  'xclub-reconcile-payments',
  '*/15 * * * *',
  $job$
  select net.http_post(
    url := (select value ->> 'url' from public.app_settings where key = 'reconciliation_url'),
    body := '{}'::jsonb,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', coalesce(
        (select value from public.app_secrets where key = 'reconciliation_secret'),
        ''
      )
    )
  )
  where exists (select 1 from public.app_settings where key = 'reconciliation_url');
  $job$
);
