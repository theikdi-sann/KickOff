#!/usr/bin/env node
/**
 * P3-34 — seed demo auth users and their paid orders/tickets against a running
 * Supabase project (local or hosted). Requires the service-role key, so it is
 * intentionally NOT part of `supabase db reset` / seed.sql.
 *
 * Usage:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/seed-demo.mjs
 *
 * Idempotent: users, profiles, orders, order seats and tickets are upserted.
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const envFile = resolve(root, '.env');
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, 'utf8').split('\n')) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    const [, key, raw] = match;
    if (process.env[key] !== undefined) continue;
    process.env[key] = raw.replace(/^['"]|['"]$/g, '');
  }
}

const supabaseUrl = (process.env.SUPABASE_URL ?? '').replace(/\/$/, '');
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

if (!supabaseUrl || !serviceRoleKey) {
  console.error('seed-demo: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.');
  process.exit(1);
}

const CUSTOMER_ID = '11111111-1111-4111-8111-111111111111';
const ADMIN_ID = '22222222-2222-4222-8222-222222222222';

const customer = {
  id: CUSTOMER_ID,
  email: process.env.DEMO_EMAIL ?? 'fan@xclub.app',
  password: process.env.DEMO_PASSWORD ?? 'xclubdemo',
  fullName: 'Nara Chaiyaporn',
  phone: '081 234 5678',
  role: 'customer',
};

const admin = {
  id: ADMIN_ID,
  email: process.env.ADMIN_DEMO_EMAIL ?? 'admin@xclub.app',
  password: process.env.ADMIN_DEMO_PASSWORD ?? 'xclubadmin',
  fullName: 'Club Operations',
  phone: '02 555 0188',
  role: 'admin',
};

async function api(path, { method = 'GET', body, prefer, key = serviceRoleKey } = {}) {
  const response = await fetch(`${supabaseUrl}${path}`, {
    method,
    headers: {
      apikey: key,
      authorization: `Bearer ${key}`,
      'content-type': 'application/json',
      ...(prefer ? { prefer } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`${method} ${path} → ${response.status}: ${text}`);
  }
  if (response.status === 204) return null;
  const text = await response.text();
  if (text.length === 0) return null;
  return JSON.parse(text);
}

async function ensureUser(user) {
  try {
    await api('/auth/v1/admin/users', {
      method: 'POST',
      body: {
        id: user.id,
        email: user.email,
        password: user.password,
        email_confirm: true,
        app_metadata: { role: user.role },
        user_metadata: { full_name: user.fullName },
      },
    });
    return;
  } catch (error) {
    const message = String(error);
    if (!/422|409|already/i.test(message)) throw error;
  }

  // Existing user: enforce the demo password and admin claim.
  await api(`/auth/v1/admin/users/${user.id}`, {
    method: 'PUT',
    body: {
      password: user.password,
      email_confirm: true,
      app_metadata: { role: user.role },
      user_metadata: { full_name: user.fullName },
    },
  });
}

const now = new Date('2026-11-01T12:20:00+07:00').toISOString();
const usedAt = new Date('2026-10-25T17:42:00+07:00').toISOString();

async function main() {
  await ensureUser(admin);
  await ensureUser(customer);

  await api('/rest/v1/profiles?on_conflict=id', {
    method: 'POST',
    prefer: 'resolution=merge-duplicates,return=minimal',
    body: [
      {
        id: customer.id,
        email: customer.email,
        full_name: customer.fullName,
        role: 'customer',
        phone: customer.phone,
        created_at: '2026-08-12T09:00:00+07:00',
      },
      {
        id: admin.id,
        email: admin.email,
        full_name: admin.fullName,
        role: 'admin',
        phone: admin.phone,
        created_at: '2026-01-05T09:00:00+07:00',
      },
    ],
  });

  await api('/rest/v1/orders?on_conflict=id', {
    method: 'POST',
    prefer: 'resolution=merge-duplicates,return=minimal',
    body: [
      {
        id: 'ord-demo-1',
        user_id: customer.id,
        match_id: 'm-bkk',
        amount_satang: 35000,
        status: 'paid',
        payment_ref: 'pi_mock_8f21a',
        created_at: now,
        paid_at: now,
      },
      {
        id: 'ord-demo-used',
        user_id: customer.id,
        match_id: 'm-ryg',
        amount_satang: 45000,
        status: 'paid',
        payment_ref: 'pi_mock_71c3d',
        created_at: '2026-10-20T09:10:00+07:00',
        paid_at: '2026-10-20T09:10:00+07:00',
      },
    ],
  });

  await api('/rest/v1/order_seats?on_conflict=id', {
    method: 'POST',
    prefer: 'resolution=merge-duplicates,return=minimal',
    body: [
      {
        id: 'os-demo-1',
        order_id: 'ord-demo-1',
        seat_id: 'm-bkk-north-C7',
        zone_name: 'North Stand',
        row_label: 'C',
        number: 7,
        price_satang: 35000,
        created_at: now,
      },
      {
        id: 'os-demo-used',
        order_id: 'ord-demo-used',
        seat_id: 'm-ryg-east-B11',
        zone_name: 'East Stand',
        row_label: 'B',
        number: 11,
        price_satang: 45000,
        created_at: '2026-10-20T09:10:00+07:00',
      },
    ],
  });

  await api('/rest/v1/tickets?on_conflict=id', {
    method: 'POST',
    prefer: 'resolution=merge-duplicates,return=minimal',
    body: [
      {
        id: 'tkt-demo-1',
        order_id: 'ord-demo-1',
        order_seat_id: 'os-demo-1',
        user_id: customer.id,
        match_id: 'm-bkk',
        seat_id: 'm-bkk-north-C7',
        qr_nonce: 'demo-nonce-1',
        status: 'valid',
        issued_at: now,
        used_at: null,
      },
      {
        id: 'tkt-demo-used',
        order_id: 'ord-demo-used',
        order_seat_id: 'os-demo-used',
        user_id: customer.id,
        match_id: 'm-ryg',
        seat_id: 'm-ryg-east-B11',
        qr_nonce: 'demo-nonce-used',
        status: 'used',
        issued_at: '2026-10-20T09:10:00+07:00',
        used_at: usedAt,
      },
    ],
  });

  for (const [seatId, ticketId] of [
    ['os-demo-1', 'tkt-demo-1'],
    ['os-demo-used', 'tkt-demo-used'],
  ]) {
    await api(`/rest/v1/order_seats?id=eq.${seatId}`, {
      method: 'PATCH',
      prefer: 'return=minimal',
      body: { ticket_id: ticketId },
    });
  }

  await api('/rest/v1/seats?id=in.(m-bkk-north-C7,m-ryg-east-B11)', {
    method: 'PATCH',
    prefer: 'return=minimal',
    body: { status: 'sold' },
  });

  console.log('seed-demo: demo admin, fan, 2 paid orders and 2 tickets are ready.');
}

main().catch((error) => {
  console.error('seed-demo failed:', error.message ?? error);
  process.exit(1);
});
