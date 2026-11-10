import { z } from "zod";

import { requireAdmin } from "../_shared/auth.ts";
import { getEnv } from "../_shared/config.ts";
import { AppError } from "../_shared/errors.ts";
import { signHmac } from "../_shared/hmac.ts";
import { ok, serveJson } from "../_shared/http.ts";
import { QR_V2_PREFIX, ticketQrSigningPayload } from "../_shared/qr.ts";
import { serviceClient } from "../_shared/supabase.ts";
import { loadTicketView } from "../_shared/ticket-view.ts";
import { validateBody } from "../_shared/validate.ts";

const bodySchema = z.object({ gateId: z.string().min(1).max(64) });

interface GateRow {
  id: string;
  name: string;
  match_id: string | null;
  active: boolean;
}

interface TicketSecret {
  id: string;
  match_id: string;
  order_id: string;
  qr_nonce: string;
}

async function handler(request: Request): Promise<Response> {
  await requireAdmin(request);
  const { gateId } = await validateBody(request, bodySchema);
  const db = serviceClient();
  const env = getEnv();

  const { data: gate, error: gateError } = await db
    .from("gates")
    .select("id,name,match_id,active")
    .eq("id", gateId)
    .maybeSingle<GateRow>();
  if (gateError) throw gateError;
  if (!gate) throw new AppError("not_found", "Gate not found");
  if (!gate.active) throw new AppError("conflict", "Gate is inactive");
  if (!gate.match_id) throw new AppError("conflict", "Gate has no fixture assigned");

  const { data: ticket, error } = await db
    .from("tickets")
    .select("id,match_id,order_id,qr_nonce")
    .eq("match_id", gate.match_id)
    .eq("status", "valid")
    .order("issued_at", { ascending: true })
    .limit(1)
    .maybeSingle<TicketSecret>();
  if (error) throw error;
  if (!ticket) {
    throw new AppError("conflict", "No valid ticket is available for this fixture");
  }

  const canonical = ticketQrSigningPayload({
    tid: ticket.id,
    mid: ticket.match_id,
    oid: ticket.order_id,
    n: ticket.qr_nonce,
  });
  const signature = await signHmac(canonical, env.TICKET_HMAC_KEY);

  const payload = {
    v: 2 as const,
    tid: ticket.id,
    mid: ticket.match_id,
    oid: ticket.order_id,
    n: ticket.qr_nonce,
    sig: signature,
  };

  const view = await loadTicketView(db, ticket.id);

  return ok(
    {
      gateId: gate.id,
      gateName: gate.name,
      payload: `${QR_V2_PREFIX}${JSON.stringify(payload)}`,
      ticket: view,
    },
    request,
  );
}

Deno.serve(serveJson(handler, ["POST"]));
