import type { Json } from "./database.types.ts";
import { AppError } from "./errors.ts";
import { getEnv } from "./config.ts";
import { logger, redact } from "./logger.ts";
import { serviceClient } from "./supabase.ts";

/**
 * Error tracking, tracing and alerting (C10.1, GAP-04).
 *
 * The structured logs already existed; what was missing is the part that
 * finds incidents before users do:
 *
 *   * **tracking** — `public.error_events` holds one row per server-side
 *     failure, so an incident survives the log drain;
 *   * **tracing** — the row carries the same `request_id` the response
 *     envelope and the `x-request-id` header carry, and the log line below
 *     carries it too: one id across every tier, no new protocol;
 *   * **alerting** — an optional `ALERT_WEBHOOK_URL` (Slack-compatible
 *     `{ text }` body) shouts, gated by a cooldown per source+code so a
 *     failing function pages once, not ninety times.
 *
 * Everything here is pure except the two side effects (insert, fetch), and
 * the recorder **never throws**: a broken observability path may not mask
 * the failure being observed — it is logged instead.
 */

/** Below this status the failure is the caller's doing, not an incident. */
export const SERVER_ERROR_STATUS = 500;

/** One alert per source+code per window: an alert that repeats is noise. */
export const ALERT_COOLDOWN_MS = 30 * 60 * 1000;

/** One pathological message cannot bloat its own row. */
const MAX_MESSAGE_CHARS = 500;

/** The incident code the reconciliation sweep records (C10.1). */
export const UNSETTLED_CODE = "payment_unsettled";

/**
 * The order states in which captured money is *not* accounted for: never
 * fulfilled (`pending`), given up on (`cancelled`), or failed after capture.
 */
const UNSETTLED_ORDER_STATUSES = new Set(["pending", "cancelled", "failed"]);

/**
 * The reconciliation verdict: Stripe captured the money, the order did not
 * settle. Every other combination is either "nothing captured" or "already
 * handled" — the sweep wakes a human only for this one.
 */
export function isUnsettled(orderStatus: string, paymentStatus: string): boolean {
  if (paymentStatus !== "paid") return false;
  return UNSETTLED_ORDER_STATUSES.has(orderStatus);
}

export interface Failure {
  code: string;
  status: number;
  message: string;
}

export interface Incident {
  code: string;
  /** The HTTP status when the incident came from a request; null otherwise. */
  status: number | null;
  message: string;
  source: string;
  requestId?: string | null;
  context?: Json;
}

/** Maps anything thrown onto the record's vocabulary. */
export function classifyFailure(thrown: unknown): Failure {
  if (thrown instanceof AppError) {
    return { code: thrown.code, status: thrown.status, message: thrown.message };
  }
  const message = thrown instanceof Error ? thrown.message : String(thrown);
  return { code: "internal", status: SERVER_ERROR_STATUS, message };
}

/** A 4xx is the caller's own problem — recorded, it would be noise. */
export function shouldRecord(status: number): boolean {
  return status >= SERVER_ERROR_STATUS;
}

/**
 * The cooldown decision, pure so it is testable without a clock or a
 * network. Returns true when this sighting may hit the webhook, and marks
 * the window either way it goes — the key is `${source}:${code}`, so one
 * broken surface cannot mute another.
 */
export function shouldAlert(
  lastAlerts: Map<string, number>,
  key: string,
  now: number,
  cooldownMs: number,
): boolean {
  const previous = lastAlerts.get(key);
  if (previous !== undefined && now - previous < cooldownMs) return false;
  lastAlerts.set(key, now);
  return true;
}

/** The Slack-compatible alert line: who failed, why, and the id to grep. */
export function alertText(input: {
  source: string;
  code: string;
  requestId: string | null;
  message: string;
}): string {
  const id = input.requestId ?? "no-request";
  return `KickOff ${input.code} in ${input.source}: ${input.message} (request ${id})`;
}

/** Per-isolate cooldown state — best-effort, and honest about being so. */
const lastAlerts = new Map<string, number>();

/** The function name from the request URL (`/functions/v1/<name>`). */
function sourceOf(request: Request): string {
  const segments = new URL(request.url).pathname.split("/").filter(Boolean);
  return segments.at(-1) ?? "unknown";
}

function detailsOf(thrown: unknown): Json | null {
  if (!(thrown instanceof AppError)) return null;
  if (thrown.details === null || typeof thrown.details !== "object") return null;
  // The redactor runs on the way in: a detail that grows to carry user
  // input later must not leak into the incident history. `redact` only
  // rewrites values, so its output is JSON by construction — the cast
  // names that fact for the client's `Json` type.
  return redact(thrown.details as Record<string, unknown>) as Json;
}

/**
 * Records one incident and, if the channel is configured and the window has
 * passed, alerts on it. Never throws.
 */
export async function recordIncident(incident: Incident): Promise<void> {
  try {
    const message = incident.message.slice(0, MAX_MESSAGE_CHARS);

    const db = serviceClient();
    const { error } = await db.from("error_events").insert({
      request_id: incident.requestId ?? null,
      code: incident.code,
      status: incident.status ?? null,
      message,
      source: incident.source,
      context: incident.context ?? null,
    });
    if (error) {
      logger.error("observability.record_failed", {
        source: incident.source,
        code: incident.code,
        error: error.message,
      });
      return;
    }

    logger.error("observability.incident", {
      requestId: incident.requestId ?? null,
      source: incident.source,
      code: incident.code,
      status: incident.status ?? null,
    });

    await maybeAlert({ ...incident, message });
  } catch (error) {
    logger.error("observability.recorder_failed", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Records the failure behind a failed request. The request id comes from
 * the response that was just built, so the record, the envelope and the
 * header can never disagree. Never throws.
 */
export async function recordFailure(
  thrown: unknown,
  request: Request,
  requestIdHeader: string | null,
): Promise<void> {
  try {
    const failure = classifyFailure(thrown);
    if (!shouldRecord(failure.status)) return;

    await recordIncident({
      ...failure,
      source: sourceOf(request),
      requestId: requestIdHeader,
      context: detailsOf(thrown),
    });
  } catch (error) {
    logger.error("observability.recorder_failed", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

async function maybeAlert(incident: Incident): Promise<void> {
  const env = getEnv();
  if (!env.ALERT_WEBHOOK_URL) return;

  const key = `${incident.source}:${incident.code}`;
  if (!shouldAlert(lastAlerts, key, Date.now(), ALERT_COOLDOWN_MS)) return;

  try {
    const response = await fetch(env.ALERT_WEBHOOK_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        text: alertText({
          source: incident.source,
          code: incident.code,
          requestId: incident.requestId ?? null,
          message: incident.message,
        }),
      }),
    });
    if (!response.ok) {
      logger.error("observability.alert_failed", { status: response.status });
    }
  } catch (error) {
    // The row is already durable; a failed shout is logged, not thrown.
    logger.error("observability.alert_failed", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
