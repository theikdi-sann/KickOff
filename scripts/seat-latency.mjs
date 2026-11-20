#!/usr/bin/env node
/**
 * NFR-13 — the seat map's read budget.
 *
 * Times the authoritative `zone_availability` read 20 times and asserts p95
 * ≤ 300 ms. The 3 s poll is already pinned by `phaseb.test.mjs`; this measures
 * the query that feeds it at the seeded seat count.
 */
const url = (process.env.SUPABASE_URL ?? '').replace(/\/$/, '');
const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const samples = Number(process.env.SEAT_LATENCY_SAMPLES ?? 20);
const targetMs = Number(process.env.SEAT_LATENCY_TARGET_MS ?? 300);

if (!url || !key) {
  console.error('seat-latency: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.');
  process.exit(2);
}

const headers = { apikey: key, authorization: `Bearer ${key}` };

async function read() {
  const started = performance.now();
  const response = await fetch(`${url}/rest/v1/zone_availability?select=*`, { headers });
  const elapsed = performance.now() - started;
  if (!response.ok) throw new Error(`zone_availability → ${response.status}: ${await response.text()}`);
  await response.arrayBuffer();
  return elapsed;
}

// Warm the pool and caches; the measurement is steady-state.
for (let index = 0; index < 3; index += 1) await read();

const times = [];
for (let index = 0; index < samples; index += 1) times.push(await read());

const sorted = [...times].sort((a, b) => a - b);
const p95 = sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1)];
const result = {
  samples,
  p50: Math.round(sorted[Math.floor(sorted.length / 2)] * 10) / 10,
  p95: Math.round(p95 * 10) / 10,
  max: Math.round(sorted[sorted.length - 1] * 10) / 10,
  targetMs,
};
console.log(JSON.stringify(result));

if (p95 > targetMs) {
  console.error(`seat-latency: p95 ${result.p95}ms exceeds ${targetMs}ms`);
  process.exit(1);
}
