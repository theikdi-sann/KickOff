#!/usr/bin/env node
/**
 * Create a fresh local admin and enrol TOTP for the browser E2E.
 *
 * A dedicated user avoids the "AAL2 required to enrol another factor" rule
 * that hits the seeded admin on a repeat run. The caller deletes the user
 * after the spec; the staff membership cascades with the profile.
 */
const url = (process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321').replace(/\/$/, '');
const anon = process.env.SUPABASE_ANON_KEY ?? '';
const service = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const tenant = process.env.DEMO_TENANT_ID ?? '00000000-0000-0000-0000-000000000001';

if (!anon || !service) {
  console.error('enroll-admin-mfa: SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY are required');
  process.exit(2);
}

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Decode(input) {
  const clean = input.replace(/=+$/, '').toUpperCase();
  const bytes = [];
  let bits = 0;
  let value = 0;
  for (const char of clean) {
    const index = BASE32.indexOf(char);
    if (index === -1) throw new Error(`not base32: ${char}`);
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

async function totp(secret) {
  const counter = Math.floor(Date.now() / 1000 / 30);
  const message = Buffer.alloc(8);
  let remaining = counter;
  for (let index = 7; index >= 0; index -= 1) {
    message[index] = remaining & 0xff;
    remaining = Math.floor(remaining / 256);
  }
  const { createHmac } = await import('node:crypto');
  const digest = createHmac('sha1', base32Decode(secret)).update(message).digest();
  const offset = digest[19] & 0x0f;
  const binary =
    ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff);
  return String(binary % 1_000_000).padStart(6, '0');
}

async function auth(path, { method = 'GET', token, body, key = anon } = {}) {
  const response = await fetch(`${url}/auth/v1/${path}`, {
    method,
    headers: {
      apikey: key,
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(body ? { 'content-type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`${method} ${path} → ${response.status}: ${text}`);
  return text ? JSON.parse(text) : null;
}

const email = `mfa-e2e+${crypto.randomUUID().slice(0, 8)}@kickoff.test`;
const password = `Mfa-${crypto.randomUUID().slice(0, 12)}`;

const created = await auth('admin/users', {
  method: 'POST',
  key: service,
  token: service,
  body: {
    email,
    password,
    email_confirm: true,
    app_metadata: { role: 'admin' },
    user_metadata: { full_name: 'MFA E2E' },
  },
});
const userId = created.user?.id ?? created.id;
if (!userId) throw new Error('admin user creation returned no id');

const membership = await fetch(`${url}/rest/v1/staff_members`, {
  method: 'POST',
  headers: {
    apikey: service,
    authorization: `Bearer ${service}`,
    'content-type': 'application/json',
    prefer: 'return=minimal',
  },
  body: JSON.stringify({ id: userId, tenant_id: tenant, staff_role: 'admin' }),
});
if (!membership.ok) throw new Error(`staff membership → ${membership.status}: ${await membership.text()}`);

const session = await auth('token?grant_type=password', {
  method: 'POST',
  body: { email, password },
});
const token = session.access_token;

const enrolled = await auth('factors', {
  method: 'POST',
  token,
  body: { factor_type: 'totp', friendly_name: 'Local E2E' },
});
const factorId = enrolled.id;
const secret = enrolled.totp?.secret ?? enrolled.secret;
if (!factorId || !secret) throw new Error('factor enrolment did not return an id and secret');

const challenge = await auth(`factors/${factorId}/challenge`, {
  method: 'POST',
  token,
  body: {},
});
const verified = await auth(`factors/${factorId}/verify`, {
  method: 'POST',
  token,
  body: { challenge_id: challenge.id, code: await totp(secret) },
});
if (!verified.access_token) throw new Error('factor verification returned no session');

console.log(JSON.stringify({ email, password, userId }));
