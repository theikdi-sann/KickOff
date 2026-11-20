#!/usr/bin/env node
/**
 * A tiny local Stripe stub for the integration suite.
 *
 * `stripe-checkout` and `refund-order` call the real Stripe SDK. Without a
 * network and a test account those calls cannot run in CI, which is why the
 * commerce tests were skipped by default. `STRIPE_API_BASE` points the SDK at
 * this server instead; `config.ts` still insists on an `sk_test_` key and the
 * webhook itself is signed locally, so no live money can move.
 *
 * It implements only the calls this repository makes. Every response is a
 * deterministic-but-unique Stripe-shaped object.
 */
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';

const port = Number(process.env.STRIPE_STUB_PORT ?? 12111);

const send = (res, status, body) => {
  const payload = JSON.stringify(body);
  res.writeHead(status, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload) });
  res.end(payload);
};

const readBody = (req) =>
  new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });

const server = createServer(async (req, res) => {
  if (!req.url?.startsWith('/v1/')) return send(res, 404, { error: { message: 'not a Stripe route' } });

  const auth = req.headers.authorization ?? '';
  if (!auth.startsWith('Bearer sk_test_')) {
    return send(res, 401, { error: { message: 'the stub only accepts sk_test_ keys' } });
  }

  const path = req.url.split('?')[0];
  const body = new URLSearchParams(await readBody(req));
  const id = (prefix) => `${prefix}_${randomUUID().replaceAll('-', '').slice(0, 24)}`;

  if (req.method === 'POST' && path === '/v1/checkout/sessions') {
    const sessionId = id('cs_test');
    return send(res, 200, {
      id: sessionId,
      object: 'checkout.session',
      mode: body.get('mode') ?? 'payment',
      status: 'open',
      url: `http://127.0.0.1:${port}/pay/${sessionId}`,
      currency: body.get('currency') ?? 'thb',
      amount_total: 0,
      metadata: { order_id: body.get('metadata[order_id]') ?? '' },
      expires_at: Number(body.get('expires_at')) || Math.floor(Date.now() / 1000) + 1800,
    });
  }

  if (req.method === 'POST' && path === '/v1/refunds') {
    return send(res, 200, {
      id: id('re_test'),
      object: 'refund',
      status: 'succeeded',
      payment_intent: body.get('payment_intent') ?? '',
      amount: 0,
      currency: 'thb',
    });
  }

  if (req.method === 'POST' && path === '/v1/accounts') {
    return send(res, 200, { id: id('acct_test'), object: 'account', charges_enabled: true });
  }

  if (req.method === 'POST' && path === '/v1/account_links') {
    return send(res, 200, { object: 'account_link', url: `http://127.0.0.1:${port}/onboard`, expires_at: Math.floor(Date.now() / 1000) + 300 });
  }

  if (req.method === 'GET' && path.startsWith('/v1/checkout/sessions/')) {
    return send(res, 200, {
      id: path.split('/').pop(),
      object: 'checkout.session',
      status: 'complete',
      payment_intent: id('pi_test'),
    });
  }

  return send(res, 404, { error: { message: `the stub does not implement ${req.method} ${path}` } });
});

// The Edge Functions run inside the Supabase Docker network, so the stub must
// listen on all interfaces; the harness points them at the bridge gateway.
server.listen(port, '0.0.0.0', () => {
  console.log(`stripe-stub listening on port ${port}`);
});
