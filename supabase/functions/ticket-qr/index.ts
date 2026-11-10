import { z } from "zod";

import { isAdmin, requireUser } from "../_shared/auth.ts";
import { getEnv } from "../_shared/config.ts";
import { AppError } from "../_shared/errors.ts";
import { signHmac } from "../_shared/hmac.ts";
import { ok, serveJson } from "../_shared/http.ts";
import { serviceClient } from "../_shared/supabase.ts";
import { validateBody } from "../_shared/validate.ts";

const bodySchema = z.object({ ticketId: z.string().min(1).max(64) });

interface TicketRow {
  id: string;
  user_id: string;
  match_id: string;
  order_id: string;
  qr_nonce: string;
  status: string;
}

async function handler(request: Request): Promise<Response> {
  const context = await requireUser(request);
  const { ticketId } = await validateBody(request, bodySchema);

  const { data: ticket, error } = await serviceClient()
    .from("tickets")
    .select("id,user_id,match_id,order_id,qr_nonce,status")
    .eq("id", ticketId)
    .maybeSingle<TicketRow>();
  if (error) throw error;
  if (!ticket) throw new AppError("not_found", "Ticket not found");

  if (ticket.user_id !== context.user.id && !isAdmin(context.user)) {
    throw new AppError("forbidden", "You do not own this ticket");
  }

  const env = getEnv();
  const canonical = `v2|${ticket.id}|${ticket.match_id}|${ticket.order_id}|${ticket.qr_nonce}`;
  const signature = await signHmac(canonical, env.TICKET_HMAC_KEY);

  const payload = {
    v: 2 as const,
    tid: ticket.id,
    mid: ticket.match_id,
    oid: ticket.order_id,
    n: ticket.qr_nonce,
    sig: signature,
  };

  return ok(
    {
      qrPayload: `KICKOFF-V2:${JSON.stringify(payload)}`,
      version: 2,
      status: ticket.status,
    },
    request,
  );
}

Deno.serve(serveJson(handler, ["POST"]));
