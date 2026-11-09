import { z } from "zod";

import { writeAudit } from "../_shared/audit.ts";
import { isAdmin, requireUser } from "../_shared/auth.ts";
import { AppError } from "../_shared/errors.ts";
import { ok, serveJson } from "../_shared/http.ts";
import { serviceClient } from "../_shared/supabase.ts";
import { validateBody } from "../_shared/validate.ts";

const bodySchema = z.object({
  userId: z.string().min(1).max(64).optional(),
  reason: z.string().max(400).optional(),
});

async function handler(request: Request): Promise<Response> {
  const context = await requireUser(request);
  const body = await validateBody(request, bodySchema);
  const targetId = body.userId ?? context.user.id;

  if (targetId !== context.user.id && !isAdmin(context.user)) {
    throw new AppError("forbidden", "You can only delete your own account");
  }

  const db = serviceClient();

  // Soft-deletes the auth user and revokes refresh sessions.
  const { error: authError } = await db.auth.admin.deleteUser(targetId, true);
  if (authError) throw authError;

  const { error: profileError } = await db
    .from("profiles")
    .update({
      email: `deleted+${targetId}@xclub.invalid`,
      full_name: "Deleted account",
      phone: null,
      role: "customer",
    })
    .eq("id", targetId);
  if (profileError) throw profileError;

  await Promise.all([
    db.from("device_tokens").delete().eq("user_id", targetId),
    db
      .from("seat_holds")
      .update({ released_at: new Date().toISOString() })
      .eq("user_id", targetId)
      .is("released_at", null),
    db.from("tickets").update({ status: "void" }).eq("user_id", targetId),
    db.from("orders").update({ payment_ref: null }).eq("user_id", targetId),
  ]);

  await writeAudit(
    {
      actorId: context.user.id,
      action: "account.delete",
      entity: "profiles",
      entityId: targetId,
      metadata: { reason: body.reason ?? null, self: targetId === context.user.id },
    },
    db,
  );

  return ok({ deleted: true, userId: targetId }, request);
}

Deno.serve(serveJson(handler, ["POST"]));
