import { z } from "zod";

import { writeAudit } from "../_shared/audit.ts";
import { requireAdmin } from "../_shared/auth.ts";
import { AppError } from "../_shared/errors.ts";
import { ok, serveJson } from "../_shared/http.ts";
import { enforceRateLimit } from "../_shared/rate-limit.ts";
import { serviceClient } from "../_shared/supabase.ts";
import { loadTicketView } from "../_shared/ticket-view.ts";
import { validateBody } from "../_shared/validate.ts";

const bodySchema = z.object({
  scanEventId: z.string().min(1).max(64),
  gateId: z.string().min(1).max(64),
});

async function handler(request: Request): Promise<Response> {
  const context = await requireAdmin(request);
  await enforceRateLimit(request, `scan-undo:${context.user.id}`, { maxHits: 60 });
  const body = await validateBody(request, bodySchema);

  const { data, error } = await context.client.rpc("undo_scan", {
    p_scan_event_id: body.scanEventId,
    p_admin_id: context.user.id,
    p_gate_id: body.gateId,
  });
  if (error) throw error;

  const result = data as unknown as {
    ok: boolean;
    ticketId: string | null;
    gateId: string;
  };

  if (!result.ok || !result.ticketId) {
    throw new AppError("conflict", "Scan could not be undone");
  }

  await writeAudit({
    actorId: context.user.id,
    action: "scan.undo",
    entity: "scan_events",
    entityId: body.scanEventId,
    metadata: { ticketId: result.ticketId, gateId: result.gateId },
  });

  const ticket = await loadTicketView(serviceClient(), result.ticketId);

  return ok({ undone: true, scanEventId: body.scanEventId, ticket }, request);
}

Deno.serve(serveJson(handler, ["POST"]));
