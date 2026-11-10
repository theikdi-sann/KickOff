/**
 * Shared helpers for opt-in integration tests. Set RUN_INTEGRATION=1 with the
 * hosted project's SUPABASE_URL / anon / service-role / Stripe webhook secret
 * and the demo fan credentials to exercise the deployed functions.
 */
const RUN = Deno.env.get("RUN_INTEGRATION") === "1";

export { RUN };

export function requireEnv() {
  const url = Deno.env.get("SUPABASE_URL");
  const anon = Deno.env.get("SUPABASE_ANON_KEY");
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
  const email = Deno.env.get("DEMO_EMAIL");
  const password = Deno.env.get("DEMO_PASSWORD");

  if (!url || !anon || !service || !webhookSecret || !email || !password) {
    throw new Error(
      "Integration test needs SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, STRIPE_WEBHOOK_SECRET, DEMO_EMAIL, DEMO_PASSWORD",
    );
  }
  return { url, anon, service, webhookSecret, email, password };
}

type Env = ReturnType<typeof requireEnv>;

export async function login(env: Env, email: string, password: string): Promise<string> {
  const response = await fetch(`${env.url}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: env.anon, "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const body = await response.json();
  if (!response.ok) throw new Error(`login failed for ${email}: ${response.status}`);
  return body.access_token as string;
}

export async function rest<T>(
  env: Env,
  path: string,
  options: { token?: string; method?: string; body?: unknown; prefer?: string } = {},
): Promise<T> {
  const response = await fetch(`${env.url}/rest/v1/${path}`, {
    method: options.method ?? "GET",
    headers: {
      apikey: env.anon,
      ...(options.token ? { authorization: `Bearer ${options.token}` } : {}),
      ...(options.body ? { "content-type": "application/json" } : {}),
      ...(options.prefer ? { prefer: options.prefer } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`${options.method ?? "GET"} ${path} → ${response.status}: ${text}`);
  return (text ? JSON.parse(text) : null) as T;
}

export async function invoke<T>(
  env: Env,
  name: string,
  options: { token: string; method?: string; body?: unknown },
): Promise<{ status: number; body: { ok: boolean; data?: T; error?: { message: string } } }> {
  const response = await fetch(`${env.url}/functions/v1/${name}`, {
    method: options.method ?? "POST",
    headers: {
      apikey: env.anon,
      authorization: `Bearer ${options.token}`,
      "content-type": "application/json",
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  return { status: response.status, body: await response.json() };
}

function toHex(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function signStripePayload(payload: string, secret: string): Promise<string> {
  const timestamp = Math.floor(Date.now() / 1000);
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`${timestamp}.${payload}`),
  );
  return `t=${timestamp},v1=${toHex(new Uint8Array(signature))}`;
}

export async function createPaidOrder(
  env: Env,
  fanToken: string,
  seatId: string,
  matchId = "m-bkk",
): Promise<{ orderId: string; sessionId: string; eventId: string }> {
  const hold = await rest<{ id: string }>(env, "rpc/create_hold", {
    token: fanToken,
    method: "POST",
    body: { p_match_id: matchId, p_seat_ids: [seatId] },
  });

  const checkout = await invoke<{ orderId: string; sessionId: string; url: string }>(
    env,
    "stripe-checkout",
    { token: fanToken, body: { holdId: hold.id } },
  );
  if (checkout.status !== 200 || !checkout.body.data) {
    throw new Error(`checkout failed: ${JSON.stringify(checkout.body)}`);
  }

  return {
    orderId: checkout.body.data.orderId,
    sessionId: checkout.body.data.sessionId,
    eventId: `evt_test_${crypto.randomUUID()}`,
  };
}

export async function sendCheckoutCompleted(
  env: Env,
  input: { orderId: string; sessionId: string; eventId: string },
): Promise<{ status: number; body: { data?: { replayed?: boolean } } }> {
  const payload = JSON.stringify({
    id: input.eventId,
    object: "event",
    type: "checkout.session.completed",
    data: {
      object: {
        id: input.sessionId,
        object: "checkout.session",
        metadata: { order_id: input.orderId },
        payment_intent: `pi_test_${crypto.randomUUID()}`,
      },
    },
  });
  const signature = await signStripePayload(payload, env.webhookSecret);
  const response = await fetch(`${env.url}/functions/v1/stripe-webhook`, {
    method: "POST",
    headers: { apikey: env.anon, "content-type": "application/json", "stripe-signature": signature },
    body: payload,
  });
  return { status: response.status, body: await response.json() };
}

export async function cleanup(
  env: Env,
  input: { orderId: string; eventId: string; seatId: string },
): Promise<void> {
  await rest(env, `orders?id=eq.${input.orderId}`, { token: env.service, method: "DELETE" });
  await rest(env, `stripe_events?id=eq.${input.eventId}`, { token: env.service, method: "DELETE" });
  await rest(env, `seats?id=eq.${input.seatId}`, {
    token: env.service,
    method: "PATCH",
    body: { status: "available" },
    prefer: "return=minimal",
  });
}

export interface IssuedTicket {
  orderId: string;
  eventId: string;
  ticketId: string;
  qrPayload: string;
}

/** Creates an order, pays it via a signed webhook, and returns the signed QR. */
export async function issueTicket(
  env: Env,
  fanToken: string,
  seatId: string,
  matchId = "m-bkk",
): Promise<IssuedTicket> {
  const order = await createPaidOrder(env, fanToken, seatId, matchId);
  const webhook = await sendCheckoutCompleted(env, order);
  if (webhook.status !== 200) {
    throw new Error(`webhook failed: ${webhook.status}`);
  }

  const tickets = await rest<Array<{ id: string }>>(
    env,
    `tickets?order_id=eq.${order.orderId}&select=id`,
    { token: env.service },
  );
  const ticketId = tickets[0]?.id;
  if (!ticketId) throw new Error("ticket was not issued");

  const qr = await invoke<{ qrPayload: string }>(env, "ticket-qr", {
    token: fanToken,
    body: { ticketId },
  });
  const qrPayload = qr.body.data?.qrPayload;
  if (!qrPayload) throw new Error(`ticket-qr failed: ${qr.status}`);

  return { orderId: order.orderId, eventId: order.eventId, ticketId, qrPayload };
}

export interface ScanResponse {
  status: number;
  body: {
    ok: boolean;
    data?: {
      ok: boolean;
      code: string;
      title: string;
      message: string;
      scanEventId?: string;
      gateId: string;
      replayed?: boolean;
    };
    error?: { message: string };
  };
}

/** Calls `scan-ticket` with an explicit idempotency key. */
export async function scanTicket(
  env: Env,
  token: string,
  input: { qr: string; gateId: string; idempotencyKey?: string },
  includeKey = true,
): Promise<ScanResponse> {
  const headers: Record<string, string> = {
    apikey: env.anon,
    authorization: `Bearer ${token}`,
    "content-type": "application/json",
  };
  if (includeKey && input.idempotencyKey) {
    headers["idempotency-key"] = input.idempotencyKey;
  }

  const response = await fetch(`${env.url}/functions/v1/scan-ticket`, {
    method: "POST",
    headers,
    body: JSON.stringify({ qr: input.qr, gateId: input.gateId }),
  });
  return { status: response.status, body: await response.json() };
}

/** Calls `scan-undo`. */
export async function scanUndo(
  env: Env,
  token: string,
  input: { scanEventId: string; gateId: string },
): Promise<{ status: number; body: { ok: boolean; data?: { undone: boolean }; error?: { message: string } } }> {
  const response = await fetch(`${env.url}/functions/v1/scan-undo`, {
    method: "POST",
    headers: {
      apikey: env.anon,
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(input),
  });
  return { status: response.status, body: await response.json() };
}
