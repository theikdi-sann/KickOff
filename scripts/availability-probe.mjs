#!/usr/bin/env node
/**
 * NFR-14 — record one availability probe for the public health endpoint.
 *
 * Runs from CI or a scheduler:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/availability-probe.mjs
 *
 * It writes one `availability_probes` row and prints the current month's SLO.
 * Exit 1 when the probe fails or the month is below 99.5 %, so a scheduler
 * notices instead of only writing history.
 */
const url = (process.env.SUPABASE_URL ?? '').replace(/\/$/, '');
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const metricsToken = process.env.METRICS_TOKEN ?? '';

if (!url || !serviceKey) {
  console.error('availability-probe: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.');
  process.exit(2);
}

const started = Date.now();
let status = null;
let ok = false;
let detail = '';
try {
  const response = await fetch(`${url}/functions/v1/health`, {
    headers: metricsToken ? { 'x-metrics-token': metricsToken } : {},
  });
  status = response.status;
  ok = response.ok;
  detail = ok ? 'ready' : (await response.text()).slice(0, 300);
} catch (error) {
  detail = error instanceof Error ? error.message : String(error);
}
const latencyMs = Date.now() - started;

const insert = await fetch(`${url}/rest/v1/availability_probes`, {
  method: 'POST',
  headers: {
    apikey: serviceKey,
    authorization: `Bearer ${serviceKey}`,
    'content-type': 'application/json',
    prefer: 'return=minimal',
  },
  body: JSON.stringify({ ok, status, latency_ms: latencyMs, source: 'health' }),
});
if (!insert.ok) {
  console.error(`availability-probe: could not record the probe (${insert.status}): ${await insert.text()}`);
  process.exit(2);
}

const month = await fetch(
  `${url}/rest/v1/availability_monthly?select=month,probes,ok_probes,availability_pct&order=month.desc&limit=1`,
  { headers: { apikey: serviceKey, authorization: `Bearer ${serviceKey}` } },
);
if (!month.ok) {
  console.error(`availability-probe: could not read the SLO (${month.status}): ${await month.text()}`);
  process.exit(2);
}
const [row] = await month.json();

console.log(
  JSON.stringify({
    checkedAt: new Date().toISOString(),
    ok,
    status,
    latencyMs,
    detail: ok ? undefined : detail,
    month: row?.month ?? null,
    probes: row?.probes ?? 0,
    availabilityPct: row?.availability_pct ?? null,
    target: 99.5,
  }),
);

if (!ok) process.exit(1);
if (row?.availability_pct !== null && row?.availability_pct !== undefined && row.availability_pct < 99.5) {
  process.exit(1);
}
