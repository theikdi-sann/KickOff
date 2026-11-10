import { z } from "zod";

import { requireAdmin } from "../_shared/auth.ts";
import { getEnv } from "../_shared/config.ts";
import { AppError } from "../_shared/errors.ts";
import { ok, serveJson } from "../_shared/http.ts";
import { logger } from "../_shared/logger.ts";
import { sha256Hex, verifyTicketQr } from "../_shared/qr.ts";
import { enforceRateLimit } from "../_shared/rate-limit.ts";
import { serviceClient } from "../_shared/supabase.ts";
import { loadTicketView, type TicketView } from "../_shared/ticket-view.ts";
import { validateBody } from "../_shared/validate.ts";

const bodySchema = z.object({
  qr: z.string().min(1).max(4096),
  gateId: z.string().min(1).max(64),
});

const KEY_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;

interface ScanRpcResult {
  code: "valid" | "used" | "invalid" | "wrong_match";
  scanEventId: string;
  ticketId: string | null;
  message?: string;
  replayed: boolean;
}

interface TicketSecret {
  id: string;
  order_id: string;
  match_id: string;
  qr_nonce: string;
}

const TITLES: Record<ScanRpcResult["code"], string> = {
  valid: "Valid pass",
  used: "Already scanned",
  invalid: "Pass rejected",
  wrong_match: "Wrong fixture",
};

function idempotencyKey(request: Request): string {
  const key = request.headers.get("idempotency-key");
  if (!key) throw new AppError("validation", "Idempotency-Key header is required");
  if (!KEY_PATTERN.test(key)) {
    throw new AppError("validation", "Idempotency-Key must be 8-64 URL-safe characters");
  }
  return key;
}

async function handler(request: Request): Promise<Response> {
  const context = await requireAdmin(request);
  const key = idempotencyKey(request);
  await enforceRateLimit(request, `scan:${context.user.id}`, { maxHits: 240 });
  const body = await validateBody(request, bodySchema);
  const db = serviceClient();
  const env = getEnv();

  const rawHash = await sha256Hex(body.qr);
  const parsed = await verifyTicketQr(body.qr, env.TICKET_HMAC_KEY);

  // Gate existence / fixture / window live in the SQL function.
  const invalidReason = parsed.ok ? null : parsed.reason;
  let ticketId = parsed.ok ? parsed.payload.tid : null;

  // Defensive: a signed payload must still match the ticket's current nonce and
  // order. This catches a pass reissued after its QR was rotated.
  if (parsed.ok) {
    const { data: secret, error } = await db
      .from("tickets")
      .select("id,order_id,match_id,qr_nonce")
      .eq("id", parsed.payload.tid)
      .maybeSingle<TicketSecret>();
    if (error) throw error;
    if (secret && (secret.qr_nonce !== parsed.payload.n || secret.order_id !== parsed.payload.oid)) {
      ticketId = null;
      logger.warn("scan.stale_payload", { ticketId: secret.id, gateId: body.gateId });
    }
  }

  const { data, error } = await context.client.rpc("scan_ticket", {
    p_ticket_id: ticketId,
    p_gate_id: body.gateId,
    p_admin_id: context.user.id,
    p_idempotency_key: key,
    p_raw_hash: rawHash,
    p_invalid_reason:
      invalidReason ??
      (ticketId === null && parsed.ok ? "This pass has been reissued" : null),
  });
  if (error) throw error;

  const result = data as unknown as ScanRpcResult;
  let ticket: TicketView | null = null;
  if (result.ticketId) {
    try {
      ticket = await loadTicketView(db, result.ticketId);
    } catch (error) {
      // The admission already committed; never turn it into a 500.
      logger.error("scan.ticket_view_failed", {
        ticketId: result.ticketId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return ok(
    {
      ok: result.code === "valid",
      code: result.code,
      title: TITLES[result.code] ?? "Pass rejected",
      message: result.message ?? TITLES[result.code] ?? "Pass checked",
      ticket: ticket ?? undefined,
      scanEventId: result.scanEventId,
      gateId: body.gateId,
      replayed: result.replayed,
    },
    request,
  );
}

Deno.serve(serveJson(handler, ["POST"]));
