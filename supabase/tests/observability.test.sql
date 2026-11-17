-- C10.1 — the durable error record (GAP-04).
--
-- Logs are ephemeral and the metrics snapshot is a scrape: an incident needs
-- a row that survives a restart and can be correlated with the response the
-- client saw (the same `request_id`). The table is Edge-written and
-- platform-read: RLS on, no policies, no client grants — a fan must not be
-- able to read (or fill) the platform's incident history.
--
--   OE-1…OE-5  the table: exists, locked down, service-role readable
--   OE-6…OE-8  the two scheduled jobs and the sweep's secret
begin;
select plan(9);

select has_table('public', 'error_events', 'OE-1 the error record table exists');

select ok(
  (select relrowsecurity from pg_class where oid = 'public.error_events'::regclass),
  'OE-2 RLS is enabled on error_events'
);

select is(
  (select count(*) from pg_policies where tablename = 'error_events'),
  0::bigint,
  'OE-3 no policy reads — nobody reaches it directly'
);

select ok(
  not has_table_privilege('anon', 'public.error_events', 'select'),
  'OE-4 anon cannot read the incident history'
);

select ok(
  not has_table_privilege('authenticated', 'public.error_events', 'select'),
  'OE-5 a club member cannot read the platform incident history'
);

select ok(
  has_table_privilege('service_role', 'public.error_events', 'select'),
  'OE-6 the service role reads it — the Edge recorder and the metrics snapshot'
);

-- ── the scheduled jobs ───────────────────────────────────────────────────────
select ok(
  exists(select 1 from cron.job where jobname = 'xclub-reconcile-payments'),
  'OE-7 the reconciliation sweep is scheduled'
);

select ok(
  exists(select 1 from cron.job where jobname = 'xclub-prune-error-events'),
  'OE-8 the retention job is scheduled'
);

select ok(
  exists(select 1 from public.app_secrets where key = 'reconciliation_secret'),
  'OE-9 the sweep secret exists and lives outside app_settings'
);

select * from finish();
rollback;
