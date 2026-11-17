import { AppError } from "../_shared/errors.ts";
import { constantTimeEqual } from "../_shared/hmac.ts";
import { ok, serveJson } from "../_shared/http.ts";
import { logger } from "../_shared/logger.ts";
import { isUnsettled, recordIncident, UNSETTLED_CODE } from "../_shared/observability.ts";
import { enforceRateLimit } from "../_shared/rate-limit.ts";
import { retrieveCheckoutSession } from "../_shared/stripe.ts";
import { serviceClient } from "../_shared/supabase.ts";

// The reconciliation sweep (C10.1, GAP-04) — the job `stripe-webhook`'s own
// comment names: Stripe can capture a payment the webhook never settles (a
// club suspended between checkout and delivery, a lost event, a crash
// mid-fulfilment). This finds those orders and records an incident for a
// human; it deliberately **never moves money itself** — refunding or
// fulfilling is a decision, and decisions belong to people (the same rule
// as the erase's money gate, RUNBOOK §9.1).

/** The webhook gets this long to settle an order before we start asking. */
const SETTLEMENT_GRACE_MS = 10 * 60 * 1000;

/** Only recent orders are worth a Stripe call; older ones were alerted already. */
const CANDIDATE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

/** One run stays inside the Stripe quota — the next run picks up the rest. */
const BATCH_LIMIT = 20;

/** A live incident re-shouts daily, not every fifteen minutes. */
const INCIDENT_TTL_MS = 24 * 60 * 60 * 1000;

const UNSETTLED_STATUSES = ["pending", "cancelled", "failed"] as const;

/** True when this order was already reported inside the incident TTL. */
async function alreadyReported(
  db: ReturnType<typeof serviceClient>,
  orderId: string,
): Promise<boolean> {
  const { data, error } = await db
    .from("error_events")
    .select("id")
    .eq("code", UNSETTLED_CODE)
    .contains("context", { orderId })
    .gte("created_at", new Date(Date.now() - INCIDENT_TTL_MS).toISOString())
    .limit(1);
  if (error) throw error;
  return (data ?? []).length > 0;
}

async function handler(request: Request): Promise<Response> {
  // Cron-only: the secret lives in `app_secrets` (never the world-readable
  // `app_settings` — the 0032 lesson) and travels as `x-cron-secret`.
  await enforceRateLimit(request, "reconcile", { maxHits: 4 });
  const db = serviceClient();

  const { data: secretRow, error: secretError } = await db
    .from("app_secrets")
    .select("value")
    .eq("key", "reconciliation_secret")
    .maybeSingle<{ value: string }>();
  if (secretError) throw secretError;

  const expected = secretRow?.value;
  const provided = request.headers.get("x-cron-secret");
  if (!expected || !provided || !constantTimeEqual(provided, expected)) {
    throw new AppError("unauthorized", "Invalid reconciliation scheduler secret");
  }

  const { data: candidates, error } = await db
    .from("orders")
    .select("id, status, stripe_session_id, amount_minor_units, tenant_id")
    .in("status", [...UNSETTLED_STATUSES])
    .not("stripe_session_id", "is", null)
    .lt("created_at", new Date(Date.now() - SETTLEMENT_GRACE_MS).toISOString())
    .gt("created_at", new Date(Date.now() - CANDIDATE_WINDOW_MS).toISOString())
    .order("created_at", { ascending: false })
    .limit(BATCH_LIMIT);
  if (error) throw error;

  let checked = 0;
  let unsettled = 0;
  let errored = 0;

  for (const order of candidates ?? []) {
    try {
      if (await alreadyReported(db, order.id)) continue;

      const session = await retrieveCheckoutSession(order.stripe_session_id);
      checked += 1;

      if (!isUnsettled(order.status, session.payment_status ?? "unpaid")) continue;

      unsettled += 1;
      await recordIncident({
        code: UNSETTLED_CODE,
        source: "reconcile-payments",
        status: null,
        message: `Order ${order.id} has a paid Stripe session but status=${order.status}`,
        context: {
          orderId: order.id,
          status: order.status,
          amountMinorUnits: order.amount_minor_units,
          tenantId: order.tenant_id,
        },
      });
    } catch (error) {
      // One odd session must not abort the run — but a run where *everything*
      // failed is a broken sweep, and that surfaces as a 500 below.
      errored += 1;
      logger.error("reconcile.candidate_failed", {
        orderId: order.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  if (checked === 0 && errored > 0 && (candidates ?? []).length > 0) {
    throw new AppError("internal", "Reconciliation sweep could not reach Stripe");
  }

  logger.info("reconcile.completed", { checked, unsettled, errored });
  return ok({ checked, unsettled, errored }, request);
}

Deno.serve(serveJson(handler, ["POST"]));
