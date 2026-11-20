#!/usr/bin/env node
/**
 * A local Expo Push API stub for the integration suite.
 *
 * The reminder function needs to prove that it fans out to every registered
 * device with the right title/body. `EXPO_PUSH_URL` points it here; the stub
 * records each batch so the test can assert what would have reached Expo.
 * In production the variable is unset and the real service is used.
 */
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';

const port = Number(process.env.PUSH_STUB_PORT ?? 12112);
/** @type {Array<Array<Record<string, unknown>>>} */
let batches = [];

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
  const path = req.url?.split('?')[0] ?? '/';

  if (req.method === 'POST' && path === '/--/api/v2/push/send') {
    const raw = await readBody(req);
    let batch = [];
    try {
      const parsed = JSON.parse(raw);
      batch = Array.isArray(parsed) ? parsed : [parsed];
    } catch {
      return send(res, 400, { errors: [{ code: 'VALIDATION_ERROR', message: 'invalid JSON' }] });
    }
    batches.push(batch);
    return send(res, 200, {
      data: batch.map(() => ({ status: 'ok', id: `ticket-${randomUUID()}` })),
    });
  }

  if (req.method === 'GET' && path === '/__batches') {
    return send(res, 200, { batches });
  }

  if (req.method === 'POST' && path === '/__reset') {
    batches = [];
    return send(res, 200, { ok: true });
  }

  return send(res, 404, { error: 'not an Expo push route' });
});

server.listen(port, '0.0.0.0', () => {
  console.log(`push-stub listening on port ${port}`);
});
