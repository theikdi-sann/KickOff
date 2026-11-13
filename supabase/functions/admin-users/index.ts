import { z } from "zod";

import { writeAudit } from "../_shared/audit.ts";
import { requireAdmin } from "../_shared/auth.ts";
import { AppError } from "../_shared/errors.ts";
import { ok, serveJson } from "../_shared/http.ts";
import { planStaffRoleUpdate, staffRoleSchema, type StaffRole } from "../_shared/roles.ts";
import { serviceClient } from "../_shared/supabase.ts";
import { validateBody, validateQuery } from "../_shared/validate.ts";

const listQuerySchema = z.object({
  role: staffRoleSchema.optional(),
  page: z.coerce.number().int().min(1).max(1000).default(1),
  perPage: z.coerce.number().int().min(1).max(100).default(50),
});

const patchSchema = z
  .object({
    id: z.string().min(1).max(64).optional(),
    role: staffRoleSchema.optional(),
    fullName: z.string().trim().min(1).max(120).optional(),
    phone: z.string().max(32).nullable().optional(),
  })
  .refine(
    (value) => value.role !== undefined || value.fullName !== undefined || value.phone !== undefined,
    "Nothing to update",
  );

type ProfileRow = {
  id: string;
  email: string;
  full_name: string;
  role: StaffRole;
  phone: string | null;
  created_at: string;
};

function toDto(row: ProfileRow) {
  return {
    id: row.id,
    email: row.email,
    fullName: row.full_name,
    role: row.role,
    phone: row.phone,
    joinedAt: row.created_at,
  };
}

function idFromRequest(request: Request): string | null {
  const url = new URL(request.url);
  const parts = url.pathname.split("/").filter(Boolean);
  const index = parts.indexOf("admin-users");
  const fromPath = index >= 0 ? parts[index + 1] : undefined;
  return fromPath ?? url.searchParams.get("id");
}

/**
 * Counts the admins that can actually act.
 *
 * `profiles.role = 'admin'` is only the display; an admin can act when their
 * JWT claim says `admin`. Counting the profile rows alone would let the club
 * demote its last *usable* admin while an unusable one (for example an
 * account promoted before the claim was written) still carries the role.
 *
 * A user whose claim cannot be read is not counted — "cannot prove it works"
 * must never count as "works".
 */
async function countUsableAdmins(
  db: ReturnType<typeof serviceClient>,
  excludeUserId: string,
): Promise<number> {
  const { data, error } = await db.from("profiles").select("id").eq("role", "admin");
  if (error) throw error;

  let usable = 0;
  for (const row of data ?? []) {
    if (row.id === excludeUserId) continue;
    const { data: user, error: userError } = await db.auth.admin.getUserById(row.id);
    if (userError) continue;
    const claim = (user?.user.app_metadata as Record<string, unknown> | undefined)?.role;
    if (claim === "admin") usable += 1;
  }
  return usable;
}

async function handler(request: Request): Promise<Response> {
  const context = await requireAdmin(request);
  const db = serviceClient();

  if (request.method === "GET") {
    const { role, page, perPage } = validateQuery(request, listQuerySchema);
    const from = (page - 1) * perPage;

    let query = db
      .from("profiles")
      .select("id,email,full_name,role,phone,created_at", { count: "exact" })
      .order("created_at", { ascending: true })
      .range(from, from + perPage - 1);
    if (role) query = query.eq("role", role);

    const { data, count, error } = await query;
    if (error) throw error;

    return ok(
      {
        items: ((data ?? []) as ProfileRow[]).map(toDto),
        page,
        perPage,
        total: count ?? 0,
      },
      request,
    );
  }

  // PATCH
  const body = await validateBody(request, patchSchema);
  const targetId = body.id ?? idFromRequest(request);
  if (!targetId) throw new AppError("validation", "Missing user id");

  if (targetId === context.user.id && body.role && body.role !== "admin") {
    throw new AppError("conflict", "You cannot demote your own account");
  }

  const { data: target, error: targetError } = await db
    .from("profiles")
    .select("id,email,full_name,role,phone,created_at")
    .eq("id", targetId)
    .maybeSingle<ProfileRow>();
  if (targetError) throw targetError;
  if (!target) throw new AppError("not_found", "User not found");

  if (target.role === "admin" && body.role !== undefined && body.role !== "admin") {
    const usableAdmins = await countUsableAdmins(db, targetId);
    if (usableAdmins === 0) {
      throw new AppError("conflict", "At least one admin must remain");
    }
  }

  const patch: Record<string, unknown> = {};
  if (body.role !== undefined) patch.role = body.role;
  if (body.fullName !== undefined) patch.full_name = body.fullName;
  if (body.phone !== undefined) patch.phone = body.phone;

  const { data: updated, error: updateError } = await db
    .from("profiles")
    .update(patch)
    .eq("id", targetId)
    .select("id,email,full_name,role,phone,created_at")
    .single<ProfileRow>();
  if (updateError) throw updateError;

  // The JWT claim is what every guard actually authorises on: `public.is_admin()`
  // reads `app_metadata.role`, and so does every Edge Function guard. Without
  // this write the role change is cosmetic — the console shows "ADMIN" while
  // the account still fails every privilege check.
  //
  // Order matters: the profile row is written first and the claim second, so
  // a failure can never leave an account with more access than its profile
  // advertises. If the claim write fails, the profile row is restored and
  // nothing is changed.
  let roleChanged = false;
  if (body.role !== undefined) {
    const plan = planStaffRoleUpdate(body.role);
    const { error: claimError } = await db.auth.admin.updateUserById(targetId, {
      app_metadata: plan.auth.app_metadata,
    });

    if (claimError) {
      // Restore the previous role so the profile never advertises more access
      // than the account has. If even that fails, say so instead of claiming
      // that nothing changed.
      const { error: restoreError } = await db
        .from("profiles")
        .update({ role: target.role })
        .eq("id", targetId);
      if (restoreError) {
        throw new AppError(
          "internal",
          "Could not update the staff role. The account still has no access — try again.",
        );
      }
      throw new AppError("internal", "Could not update the staff role. Nothing was changed.");
    }

    roleChanged = plan.profile.role !== target.role;
  }

  await writeAudit(
    {
      actorId: context.user.id,
      action: "admin.user.update",
      entity: "profiles",
      entityId: targetId,
      metadata: { ...patch, role_claim_updated: body.role !== undefined },
    },
    db,
  );

  return ok(
    {
      ...toDto(updated),
      // The claim travels in the access token, so an existing session keeps
      // the old role until the token is refreshed.
      roleAppliesAtNextSignIn: body.role !== undefined,
      roleChanged,
    },
    request,
  );
}

Deno.serve(serveJson(handler, ["GET", "PATCH"]));
