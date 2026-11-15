#!/usr/bin/env node
/**
 * Stage 0 — MVP demo gate (P10c-01) as an executable check.
 *
 * Walks the full purchase flow against the linked Supabase project:
 *   health → fan login → seat → hold → Stripe test Checkout → test card
 *   → webhook issues tickets → QR → admin scan → second scan rejects
 *   → receipt → refund → cleanup.
 *
 * Usage:  node scripts/mvp-gate.mjs
 * Requires .env with SUPABASE_* and STRIPE_SECRET_KEY (test mode only).
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from '@playwright/test';

const root = resolve(import.meta.dirname, '..');
if (existsSync(resolve(root, '.env'))) {
  for (const line of readFileSync(resolve(root, '.env'), 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m || process.env[m[1]] !== undefined) continue;
    process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
}

const URL_ = (process.env.SUPABASE_URL ?? '').replace(/\/$/, '');
const ANON = process.env.SUPABASE_ANON_KEY ?? '';
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const STRIPE = process.env.STRIPE_SECRET_KEY ?? '';
const FUNCTIONS = `${URL_}/functions/v1`;

if (!URL_ || !ANON || !SERVICE || !STRIPE) {
  console.error('mvp-gate: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY and STRIPE_SECRET_KEY are required.');
  process.exit(1);
}
if (!STRIPE.startsWith('sk_test_')) {
  console.error('mvp-gate: refusing — STRIPE_SECRET_KEY is not a test-mode key (§0 guardrail 14).');
  process.exit(1);
}

const results = [];
const step = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

const rest = async (path, { token = ANON, method = 'GET', body, headers = {} } = {}) => {
  const res = await fetch(`${URL_}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: ANON,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${await res.text()}`);
  const text = await res.text();
  return text ? JSON.parse(text) : null;
};

const fn = async (name, { token, method = 'POST', body, headers = {} } = {}) => {
  const res = await fetch(`${FUNCTIONS}/${name}`, {
    method,
    headers: { apikey: ANON, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`${name} → ${res.status}: ${JSON.stringify(json)}`);
  return json;
};

const login = async (email, password) => {
  const res = await fetch(`${URL_}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error(`login ${email} → ${res.status}: ${await res.text()}`);
  return (await res.json()).access_token;
};

const adminToken = await login('admin@kickoff.app', process.env.E2E_ADMIN_PASSWORD ?? 'kickoffadmin');
const fanEmail = process.env.DEMO_EMAIL ?? 'demoFan@kickoff.test';
const fanPassword = process.env.DEMO_PASSWORD ?? 'demo@Password';

// 1. Health.
const health = await (await fetch(`${FUNCTIONS}/health`)).json();
step('edge health', health?.ok === true, health?.data?.status);

// 2. Fan logs in and reads the catalog.
const fanToken = await login(fanEmail, fanPassword);
step('fan login', Boolean(fanToken));
const matches = await rest('matches?select=id,kickoff_at,status&status=eq.upcoming&order=kickoff_at');
step('catalog readable', matches.length > 0, `${matches.length} upcoming`);

// 3. Fixture inside the ±2h scan window (F-4), with its own gate. The id is
//    allocated before creation so cleanup can always target it.
const fixtureId = `gate-${Date.now()}`;
const kickoffAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();

// Fixture rows must never outlive the run, pass or fail. Order matters:
// tickets (cascading the scan log) → scan_events → order_seats → orders →
// gates → seats → zones → matches (each level references the one below).
const cleanupFixture = async () => {
  const orderRows = await rest(`orders?select=id&match_id=eq.${fixtureId}`, { token: SERVICE }).catch(() => []);
  const paths = [
    // The tickets go first: deleting them cascades the scan log away (an FK
    // cascade is not an edit, so the append-only trigger in 0044 lets it
    // through), and the gate cannot be deleted while a scan still references
    // it. The explicit scan_events path below then matches no rows.
    ...(orderRows ?? []).map((o) => `tickets?order_id=eq.${o.id}`),
    `scan_events?gate_id=eq.${fixtureId}-gate`,
    ...(orderRows ?? []).map((o) => `order_seats?order_id=eq.${o.id}`),
    ...(orderRows ?? []).map((o) => `orders?id=eq.${o.id}`),
    `gates?id=eq.${fixtureId}-gate`,
    `seat_holds?seat_id=eq.${fixtureId}-A1`,
    `seats?id=eq.${fixtureId}-A1`,
    `zones?id=eq.${fixtureId}-zone`,
    `matches?id=eq.${fixtureId}`,
  ];
  for (const path of paths) {
    try {
      // Service role: cleanup must succeed even when the run failed mid-flow
      // and RLS would hide the rows from the admin/fan tokens.
      await rest(path, { token: SERVICE, method: 'DELETE' });
    } catch (err) {
      console.log(`      cleanup note (${path.split('?')[0]}): ${err.message.split('\n')[0]}`);
    }
  }
};

try {
  // Fixture creation lives inside the try: a failure half-way (say the zones
  // insert) must still reach cleanup instead of orphaning a match row.
  await rest('matches', {
    token: adminToken,
    method: 'POST',
    body: { id: fixtureId, opponent: 'Gate FC', opponent_short: 'GAT', kickoff_at: kickoffAt },
  });
  await rest('zones', {
    token: adminToken,
    method: 'POST',
    body: { id: `${fixtureId}-zone`, match_id: fixtureId, name: 'Gate Stand', rows: ['A'], seats_per_row: 2 },
  });
  await rest('match_zone_prices', {
    token: adminToken,
    method: 'POST',
    body: { match_id: fixtureId, zone_id: `${fixtureId}-zone`, price_minor_units: 35000 },
  });
  await rest('seats', {
    token: adminToken,
    method: 'POST',
    body: { id: `${fixtureId}-A1`, zone_id: `${fixtureId}-zone`, row_label: 'A', number: 1 },
  });
  // `matches.venue_id` defaults at the home ground, so the physical gate
  // stands there too (0044); the fixture is assigned through match_gates.
  await rest('gates', {
    token: adminToken,
    method: 'POST',
    body: { id: `${fixtureId}-gate`, name: 'Gate One', venue_id: 'v_kickoff', active: true },
  });
  await rest('match_gates', {
    token: adminToken,
    method: 'POST',
    body: { match_id: fixtureId, gate_id: `${fixtureId}-gate` },
  });
  step('fixture + zone + seat + gate + assignment created', true, fixtureId);

  // 4. Fan holds the seat and starts Checkout.
  const hold = await rest('rpc/create_hold', {
    token: fanToken,
    method: 'POST',
    body: { p_match_id: fixtureId, p_seat_ids: [`${fixtureId}-A1`] },
  });
  step('seat held', Boolean(hold?.id), hold?.id);

  const checkout = await fn('stripe-checkout', { token: fanToken, body: { holdId: hold.id } });
  const sessionId = checkout?.data?.sessionId;
  const orderId = checkout?.data?.orderId;
  step('checkout session created', Boolean(sessionId), orderId);

  // 5. Pay with the Stripe test card (this fires the configured webhook).
  //
  // Browser hardening (diagnosed 2026-11-13): the hosted page withholds
  // nothing, but it is read by Stripe's risk engine, so launch the full
  // Chromium (not the headless shell), send a normal Chrome UA built from its
  // real version, and clear navigator.webdriver before any page script runs.
  const browser = await chromium.launch({ channel: 'chromium' });
  const context = await browser.newContext({
    userAgent: `Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${browser.version()} Safari/537.36`,
  });
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  });
  const page = await context.newPage();

  // Everything the payment needs lives inside Stripe's Payment Element iframe,
  // never in the main document. Resolve the frame by what it renders — the
  // iframe's URL carries a Stripe-internal build name that may change.
  const paymentElement = async () => {
    for (let attempt = 0; attempt < 30; attempt++) {
      for (const frame of page.frames()) {
        if (frame === page.mainFrame()) continue;
        const known = await frame
          .locator('#linkAuthentication-emailInput, input[autocomplete="cc-number"]')
          .count()
          .catch(() => 0);
        if (known > 0) return frame;
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    throw new Error('payment element frame did not render');
  };

  let paid = false;
  try {
    await page.goto(checkout.data.url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    const element = await paymentElement();

    const contact = element.locator('#linkAuthentication-emailInput');
    if ((await contact.count()) > 0 && (await contact.first().isEditable().catch(() => false))) {
      // Stripe locks and pre-fills this field when the session carries a
      // customer_email (our checkout always does) — only fill an editable one.
      await contact.fill(fanEmail, { timeout: 10_000 });
    }

    // The fields are addressed by their W3C autocomplete tokens: the current
    // Payment Element names them `payment-*` and the legacy `#cardNumber` id
    // is gone. Sessions are card-only today (F-9), but when the checkout is
    // not restricted PromptPay is selected by default and the card fields
    // hide behind the Card option — handle that layout too, and only then.
    // Give the method list time to hydrate first: an option that matches
    // before its handlers are wired takes the click and ignores it.
    const cardFields = element.locator('input[autocomplete="cc-number"]');
    if ((await cardFields.count()) === 0) {
      const cardMethod = element.getByText(/Card\s*Visa/i);
      await cardMethod.first().waitFor({ state: 'visible', timeout: 10_000 }).catch(() => {});
      if ((await cardMethod.count()) > 0) await cardMethod.first().click();
    }
    await cardFields.first().waitFor({ state: 'visible', timeout: 20_000 });

    await cardFields.first().fill('4242424242424242', { timeout: 10_000 });
    await element.locator('input[autocomplete="cc-exp"]').fill('1234', { timeout: 10_000 });
    await element.locator('input[autocomplete="cc-csc"]').fill('123', { timeout: 10_000 });
    const billingName = element.locator('input[autocomplete="cc-name"]');
    if ((await billingName.count()) > 0) await billingName.first().fill('Demo Fan', { timeout: 10_000 });

    await element.getByRole('button', { name: /^pay$/i }).first().click({ timeout: 20_000 });
    // success_url is the kickoff:// deep link, so the browser never navigates;
    // the payment itself is what matters — the webhook fires server-side.
    await page.waitForTimeout(8000);
    paid = true;
  } catch (err) {
    // First lines carry the locator and the call log — enough to see which
    // field refused without a second instrumented run.
    console.log(`      checkout page note: ${err.message.split('\n').slice(0, 4).join(' | ')}`);
  } finally {
    await browser.close();
  }
  step('stripe test card submitted', paid);

  // 6. Webhook → order paid → tickets issued. Payment can land a few seconds
  //    after the click (Stripe's anti-bot check delays submission), so wait for
  //    the order to flip to `paid` before looking for tickets.
  //    Both polls must run as the fan: RLS hides other users' rows from anon.
  let orderStatus = 'pending';
  for (let i = 0; i < 40 && orderStatus !== 'paid'; i++) {
    await new Promise((r) => setTimeout(r, 1500));
    const rows = await rest(`orders?select=status&id=eq.${orderId}`, { token: fanToken });
    orderStatus = rows?.[0]?.status ?? 'missing';
  }
  step('webhook marked order paid', orderStatus === 'paid', orderStatus);

  let tickets = [];
  for (let i = 0; i < 10 && tickets.length === 0; i++) {
    await new Promise((r) => setTimeout(r, 1500));
    tickets = await rest(`tickets?select=id,status&order_id=eq.${orderId}`, { token: fanToken });
  }
  step('webhook issued tickets', tickets.length > 0, `${tickets.length} ticket(s)`);
  step('ticket is valid', tickets[0]?.status === 'valid', tickets[0]?.status);

  if (tickets.length > 0) {
    // 7. QR pass.
    const qr = await fn('ticket-qr', { token: fanToken, method: 'POST', body: { ticketId: tickets[0].id } });
    const qrPayload = qr?.data?.qrPayload;
    step('qr issued', Boolean(qrPayload), String(qrPayload).slice(0, 24) + '…');

    // 8. Admin scan approves, second scan rejects. scan-ticket requires an
    //    Idempotency-Key per request; each call needs its own or the second
    //    scan replays the first result instead of reporting `used`.
    const scan1 = await fn('scan-ticket', {
      token: adminToken,
      body: { qr: qrPayload, gateId: `${fixtureId}-gate` },
      headers: { 'Idempotency-Key': `mvp-gate-${fixtureId}-scan1` },
    });
    step('first scan accepted', scan1?.data?.code === 'valid', scan1?.data?.code);
    const scan2 = await fn('scan-ticket', {
      token: adminToken,
      body: { qr: qrPayload, gateId: `${fixtureId}-gate` },
      headers: { 'Idempotency-Key': `mvp-gate-${fixtureId}-scan2` },
    });
    step('second scan rejected', scan2?.data?.code === 'used', scan2?.data?.code);

    // 9. Receipt.
    const receipt = await fn('receipt', { token: fanToken, method: 'POST', body: { orderId } });
    step('pdf receipt available', Boolean(receipt?.data), receipt?.data ? 'receipt' : 'missing');

    // 10. Refund (F-2: admin override path). The pass was just scanned, so
    //     the refund needs the explicit override flag the API documents.
    const refund = await fn('refund-order', {
      token: adminToken,
      body: { orderId, reason: 'mvp-gate', overrideUsedTickets: true },
    });
    step('refund processed', Boolean(refund?.data), refund?.data?.status ?? '');
  }
} catch (err) {
  step('gate aborted', false, err.message.split('\n')[0]);
} finally {
  await cleanupFixture();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} steps passed`);
if (failed.length) {
  console.error(`mvp-gate: FAILED → ${failed.map((f) => f.name).join(', ')}`);
  process.exit(1);
}
console.log('mvp-gate: MVP demo flow is green.');
