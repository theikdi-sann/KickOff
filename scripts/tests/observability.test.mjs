// C10.1 — observability: error tracking, tracing and alerting (GAP-04).
//
// Structured logs and the `metrics` snapshot already exist; what was missing
// is the part that finds incidents before users do: a durable error record,
// one request id across every tier, an alert channel with a sane cooldown,
// and the reconciliation sweep that catches a payment the webhook could not
// settle (the C8.1 leftover).
//
//   OBS-1  every server-side failure is recorded before the response goes out
//   OBS-2  client errors are not recorded — signal, not noise
//   OBS-3  the alert webhook is optional and its payload names the request id
//   OBS-4  alerts are cooldown-gated per source + code
//   OBS-5  the metrics snapshot counts errors and unsettled payments
//   OBS-6  the reconciliation sweep is cron-scheduled and secret-guarded
//   OBS-7  error_events is bounded by a retention job
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..', '..');
const read = (path) => readFileSync(resolve(root, path), 'utf8');

const HTTP = 'supabase/functions/_shared/http.ts';
const OBSERVABILITY = 'supabase/functions/_shared/observability.ts';
const CONFIG = 'supabase/functions/_shared/config.ts';
const METRICS = 'supabase/functions/metrics/index.ts';
const RECONCILE = 'supabase/functions/reconcile-payments/index.ts';
const MIGRATION = 'supabase/migrations/0055_observability.sql';

test('OBS-1 every server-side failure is recorded before the response goes out', () => {
  const http = read(HTTP);
  assert.match(
    http,
    /import \{ recordFailure \} from "\.\/observability\.ts"/,
    'http.ts depends on the recorder',
  );
  assert.match(
    http,
    /await recordFailure\(error, request,/,
    'the serveJson catch records the failure before failing the request',
  );

  const observability = read(OBSERVABILITY);
  // The recording path itself must never throw: a broken observability
  // pipeline may not mask the original failure.
  assert.match(
    observability,
    /never throws|never rejects|catch/,
    'recordFailure swallows its own failures (and logs them)',
  );
  // Tracing: the same id appears on the record that the response envelope
  // and the log line already carry.
  assert.match(observability, /requestId/, 'the record carries the request id');
});

test('OBS-2 client errors are not recorded — signal, not noise', () => {
  const observability = read(OBSERVABILITY);
  assert.match(
    observability,
    /export const SERVER_ERROR_STATUS = 500/,
    'the 5xx boundary is a named constant, not a literal at the call site',
  );
  assert.match(
    observability,
    /return status >= SERVER_ERROR_STATUS/,
    'the recorder only ever records through the named boundary',
  );
  assert.match(
    observability,
    /export function shouldRecord\(/,
    'the decision is a named predicate the Deno tests pin',
  );
});

test('OBS-3 the alert webhook is optional and its payload names the request id', () => {
  const config = read(CONFIG);
  assert.match(
    config,
    /ALERT_WEBHOOK_URL: z\.url\(\)\.optional\(\)/,
    'the channel is configuration — local and CI run without one',
  );

  const observability = read(OBSERVABILITY);
  assert.match(observability, /text:/, 'the body is Slack-compatible ({ text })');
  assert.match(
    observability,
    /requestId: incident\.requestId/,
    'the alert carries the request id for correlation',
  );
});

test('OBS-4 alerts are cooldown-gated per source + code', () => {
  const observability = read(OBSERVABILITY);
  assert.match(observability, /ALERT_COOLDOWN_MS/, 'the window is a named constant');
  assert.match(
    observability,
    /export function shouldAlert\(/,
    'the cooldown decision is pure, so it is testable without a network',
  );

  const tests = read('supabase/functions/tests/observability.test.ts');
  assert.match(tests, /cooldown/i, 'the cooldown has a Deno test');
});

test('OBS-5 the metrics snapshot counts errors and unsettled payments', () => {
  const metrics = read(METRICS);
  assert.match(metrics, /errors:\s*\{/, 'error counts are part of the scrape');
  assert.match(metrics, /unsettled/, 'the C8.1 incident is a scraped number');
});

test('OBS-6 the reconciliation sweep is cron-scheduled and secret-guarded', () => {
  const reconcile = read(RECONCILE);
  assert.match(reconcile, /x-cron-secret/, 'the scheduler proves itself');
  assert.match(reconcile, /reconciliation_secret/, 'the secret lives in app_secrets');
  assert.match(reconcile, /constantTimeEqual/, 'the comparison is constant-time');
  assert.match(reconcile, /enforceRateLimit\(/, 'a spammer cannot burn the Stripe quota');
  assert.match(
    reconcile,
    /retrieveCheckoutSession/,
    'the sweep asks Stripe what the session actually did',
  );

  const migration = read(MIGRATION);
  assert.match(migration, /xclub-reconcile-payments/, 'pg_cron schedules the sweep');
  assert.match(migration, /net\.http_post/, 'the job posts to the function URL');
  assert.match(
    migration,
    /reconciliation_url/,
    'the target URL is configuration, so one migration works locally and hosted',
  );
});

test('OBS-7 error_events is bounded by a retention job', () => {
  const migration = read(MIGRATION);
  assert.match(migration, /xclub-prune-error-events/, 'the retention job exists');
  assert.match(migration, /'30 days'/, 'records older than the window are pruned');
  assert.match(migration, /create table (if not exists )?public\.error_events/, 'the table exists');
});
