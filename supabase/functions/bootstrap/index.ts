import { z } from "zod";

import { requireUser } from "../_shared/auth.ts";
import { AppError } from "../_shared/errors.ts";
import { ok, serveJson } from "../_shared/http.ts";
import {
  isValidClubSlug,
  planBootstrapClaim,
} from "../_shared/platform.ts";
import { serviceClient } from "../_shared/supabase.ts";
import { validateBody } from "../_shared/validate.ts";

// ADR-004 §1 — the white-label binding: the app is built per club and knows
// its own slug; at sign-in it sends that slug here, and this writes the
// `app_metadata.tenant_id` claim the session is scoped by (D-29).
//
// Binding is deliberately open to any *active* club: a fan's identity is
// global (ADR-004 §2), the claim only says which catalogue the session
// reads, and authority still comes from `staff_members` — never from this
// claim. A suspended club does not bind, which is what suspension means.
const bodySchema = z.object({
  slug: z.string().min(1).max(64),
});

async function handler(request: Request): Promise<Response> {
  const context = await requireUser(request);
  const body = await validateBody(request, bodySchema);

  // The database's own shape (0040), checked before anything is sent: a
  // malformed slug is a validation error, an unknown one is a 404.
  if (!isValidClubSlug(body.slug)) {
    throw new AppError("validation", "Unknown club slug");
  }

  // The user-scoped client reads the registry through RLS: active clubs
  // only, tombstones excluded, branding columns only (0040 + 0054's policy).
  // The explicit status filter keeps the intent visible even though the
  // policy already enforces both conditions.
  const { data: club, error } = await context.client
    .from("tenants")
    .select("id, slug")
    .eq("slug", body.slug)
    .eq("status", "active")
    .maybeSingle<{ id: string; slug: string }>();
  if (error) throw error;
  if (!club) throw new AppError("not_found", "Club not found");

  // A user-scoped client cannot write app_metadata: the admin API can. The
  // claim is merged, never replaced — the platform claim and any other key
  // a tier owns must survive this sign-in (the lesson of GAP-09.0).
  const { error: updateError } = await serviceClient().auth.admin.updateUserById(
    context.user.id,
    { app_metadata: { ...context.user.app_metadata, ...planBootstrapClaim(club.id) } },
  );
  if (updateError) throw updateError;

  return ok({ tenantId: club.id, slug: club.slug }, request);
}

Deno.serve(serveJson(handler, ["POST"]));
