import { z } from "zod";

import { requireUser } from "../_shared/auth.ts";
import { ok, serveJson } from "../_shared/http.ts";
import { enforceRateLimit } from "../_shared/rate-limit.ts";
import { serviceClient } from "../_shared/supabase.ts";
import { validateBody } from "../_shared/validate.ts";

const bodySchema = z.object({ orderId: z.string().min(1).max(64) });

async function handler(request: Request): Promise<Response> {
  const context = await requireUser(request);
  await enforceRateLimit(request, `cancel-order:${context.user.id}`, { maxHits: 30 });
  const { orderId } = await validateBody(request, bodySchema);

  const db = serviceClient();
  const { data, error } = await db.rpc("cancel_order", {
    p_order_id: orderId,
    p_actor_id: context.user.id,
  });
  if (error) throw error;

  const result = data as { ok?: boolean; status?: string } | null;
  return ok({ cancelled: true, orderId, status: result?.status ?? "cancelled" }, request);
}

Deno.serve(serveJson(handler, ["POST"]));
