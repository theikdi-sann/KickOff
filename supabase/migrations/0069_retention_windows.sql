-- NFR-16 — the retention schedule becomes executable.
--
-- docs/PRIVACY.md promises: orders/tickets/refunds/audit 7 years;
-- scan_events 3 years; stripe_events 90 days; unused device_tokens 90 days;
-- error_events 30 days (already pruned by 0055). This migration owns the first
-- four windows in one daily sweep. `error_events` keeps its dedicated job.
--
-- Device tokens gain `last_seen_at`: the requirement is 90 days *unused*, not
-- 90 days since first registration. The devices endpoint refreshes it on every
-- upsert.

alter table public.device_tokens
  add column if not exists last_seen_at timestamptz not null default now();

update public.device_tokens
set last_seen_at = created_at
where last_seen_at > created_at;

create index if not exists device_tokens_last_seen_idx
  on public.device_tokens (last_seen_at);

create index if not exists stripe_events_created_at_idx
  on public.stripe_events (created_at);

create or replace function public.prune_retention_windows()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_financial_cutoff timestamptz := now() - interval '7 years';
  v_scan_cutoff timestamptz := now() - interval '3 years';
  v_stripe_cutoff timestamptz := now() - interval '90 days';
  v_token_cutoff timestamptz := now() - interval '90 days';
  v_scans bigint := 0;
  v_stripe bigint := 0;
  v_tokens bigint := 0;
  v_audit bigint := 0;
  v_orders bigint := 0;
begin
  -- Scan history is the shortest financial-adjacent window. The append-only
  -- trigger (0044) allows the purge only under the documented maintenance
  -- flag; the definer owner satisfies its role check.
  perform set_config('kickoff.scan_events_maintenance', 'on', true);
  delete from public.scan_events where created_at < v_scan_cutoff;
  get diagnostics v_scans = row_count;

  delete from public.stripe_events where created_at < v_stripe_cutoff;
  get diagnostics v_stripe = row_count;

  delete from public.device_tokens where last_seen_at < v_token_cutoff;
  get diagnostics v_tokens = row_count;

  delete from public.audit_logs where created_at < v_financial_cutoff;
  get diagnostics v_audit = row_count;

  -- Refunds, tickets, order_seats and their scans cascade from the order.
  delete from public.orders where created_at < v_financial_cutoff;
  get diagnostics v_orders = row_count;

  return jsonb_build_object(
    'scan_events', v_scans,
    'stripe_events', v_stripe,
    'device_tokens', v_tokens,
    'audit_logs', v_audit,
    'orders', v_orders
  );
end;
$$;

revoke all on function public.prune_retention_windows() from public, anon, authenticated;
grant execute on function public.prune_retention_windows() to service_role;

-- One daily sweep. `0055` already owns the 30-day error-event job.
select cron.unschedule(jobid) from cron.job where jobname = 'xclub-retention-sweep';
select cron.schedule(
  'xclub-retention-sweep',
  '27 4 * * *',
  $job$
  select public.prune_retention_windows();
  $job$
);

notify pgrst, 'reload schema';
