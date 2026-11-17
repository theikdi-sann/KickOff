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

  // The profile row is scrubbed in place — the column set below is exactly
  // what `profiles` still has: `role` was dropped with `0048`, and writing it
  // here failed the update at runtime (GAP-09.0). The erasure below follows
  // docs/PRIVACY.md's schedule exactly (GAP-09.3).
  const { error: profileError } = await db
    .from("profiles")
    .update({
      email: `deleted+${targetId}@kickoff.invalid`,
      full_name: "Deleted account",
      phone: null,
    })
    .eq("id", targetId);
  if (profileError) throw profileError;

  await Promise.all([
    // ERASE — the fan's device tokens and seat holds are gone outright: no
    // other row references either (nothing references `seat_holds`), so the
    // erasure is a plain delete (docs/PRIVACY.md).
    db.from("device_tokens").delete().eq("user_id", targetId),
    db.from("seat_holds").delete().eq("user_id", targetId),
    // RETAIN — an unused pass is voided (the in-app notice's promise); a used
    // pass keeps its record, because the gate log is the safety record.
    db.from("tickets").update({ status: "void" }).eq("user_id", targetId).eq("status", "valid"),
    // RETAIN — financial rows are kept exactly as they were: the payment
    // reference is reconciliation data, not personal data.
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
