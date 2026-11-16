import { z } from "zod";

import { writeAudit } from "../_shared/audit.ts";
import { requireAdmin, type AuthContext } from "../_shared/auth.ts";
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
  phone: string | null;
  created_at: string;
};

/** A membership at the caller's club — the authority the database reads. */
type MembershipRow = {
  id: string;
  tenant_id: string;
  staff_role: string;
};

function toDto(row: ProfileRow, role: StaffRole) {
  return {
    id: row.id,
    email: row.email,
    fullName: row.full_name,
    role,
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
 * The club this call acts for.
 *
 * `context.client` carries the caller's JWT, so `current_tenant()` resolves
 * the caller's club — the same value the database's RLS uses. The service
 * client bypasses RLS, so the writes below must name the club explicitly.
 */
async function callerClub(context: AuthContext): Promise<string> {
  const { data, error } = await context.client.rpc("current_tenant");
  if (error) throw error;
  if (!data) throw new AppError("internal", "The club of this session could not be resolved");
  return data as string;
}

/**
 * The club's memberships.
 *
 * Read through the caller's client, so RLS decides the scope: an admin reads
 * the memberships of their own club and nobody else's. A person's role *is*
 * their membership — a profile row belongs to no club of its own.
 */
async function clubMemberships(context: AuthContext): Promise<MembershipRow[]> {
  const { data, error } = await context.client
    .from("staff_members")
    .select("id,tenant_id,staff_role");
  if (error) throw error;
  return (data ?? []) as MembershipRow[];
}

/**
 * Writes the club's membership for a person.
 *
 * `null` removes it — a person without a membership is a customer. The
 * membership is what `is_admin()`, `is_staff()` and `is_gate_operator()` read,
 * so this is the write that changes what the account can do.
 */
async function writeMembership(
  db: ReturnType<typeof serviceClient>,
  tenantId: string,
  userId: string,
  staffRole: StaffRole | null,
): Promise<void> {
  if (staffRole === null) {
    const { error } = await db
      .from("staff_members")
      .delete()
      .eq("id", userId)
      .eq("tenant_id", tenantId);
    if (error) throw error;
    return;
  }

  const { error } = await db
    .from("staff_members")
    .upsert(
      { id: userId, tenant_id: tenantId, staff_role: staffRole },
      { onConflict: "id,tenant_id" },
    );
  if (error) throw error;
}

/** Puts the membership back when the claim write fails. */
async function restoreMembership(
  db: ReturnType<typeof serviceClient>,
  tenantId: string,
  userId: string,
  previousRole: StaffRole,
): Promise<void> {
  await writeMembership(db, tenantId, userId, previousRole === "customer" ? null : previousRole);
}

/**
 * Counts the admins that can actually act.
 *
 * A membership says the account *may* act; the JWT claim says the Edge
 * guards *will* let it. Counting the memberships alone would let the club
 * demote its last *usable* admin while an unusable one (for example an
 * account promoted before the claim was written) still carries the role.
 *
 * A user whose claim cannot be read is not counted — "cannot prove it works"
 * must never count as "works".
 */
async function countUsableAdmins(
  db: ReturnType<typeof serviceClient>,
  memberships: MembershipRow[],
  excludeUserId: string,
): Promise<number> {
  let usable = 0;

  for (const membership of memberships) {
    if (membership.staff_role !== "admin") continue;
    if (membership.id === excludeUserId) continue;
    const { data: user, error: userError } = await db.auth.admin.getUserById(membership.id);
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

    const memberships = await clubMemberships(context);
    const roles = new Map(memberships.map((m) => [m.id, m.staff_role]));

    let query = db
      .from("profiles")
      .select("id,email,full_name,phone,created_at", { count: "exact" })
      .order("created_at", { ascending: true })
      .range(from, from + perPage - 1);

    if (role && role !== "customer") {
      // The people who hold this role — the membership names them.
      const ids = memberships.filter((m) => m.staff_role === role).map((m) => m.id);
      if (ids.length === 0) {
        return ok({ items: [], page, perPage, total: 0 }, request);
      }
      query = query.in("id", ids);
    } else if (role === "customer") {
      // Everyone who holds no membership. The filter has to run in the
      // database, or a page of people would silently lose the customers.
      const memberIds = memberships.map((m) => m.id);
      if (memberIds.length > 0) {
        query = query.not("id", "in", `(${memberIds.map((id) => `"${id}"`).join(",")})`);
      }
    }

    const { data, count, error } = await query;
    if (error) throw error;

    const items = ((data ?? []) as ProfileRow[])
      .map((row) => toDto(row, (roles.get(row.id) as StaffRole | undefined) ?? "customer"))
      .filter((item) => (role ? item.role === role : true));

    return ok(
      {
        items,
        page,
        perPage,
        total: count ?? items.length,
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
    .select("id,email,full_name,phone,created_at")
    .eq("id", targetId)
    .maybeSingle<ProfileRow>();
  if (targetError) throw targetError;
  if (!target) throw new AppError("not_found", "User not found");

  const tenantId = await callerClub(context);
  const memberships = await clubMemberships(context);
  const currentRole =
    (memberships.find((m) => m.id === targetId)?.staff_role as StaffRole | undefined) ?? "customer";

  if (currentRole === "admin" && body.role !== undefined && body.role !== "admin") {
    const usableAdmins = await countUsableAdmins(db, memberships, targetId);
    if (usableAdmins === 0) {
      throw new AppError("conflict", "At least one admin must remain");
    }
  }

  const patch: Record<string, unknown> = {};
  if (body.fullName !== undefined) patch.full_name = body.fullName;
  if (body.phone !== undefined) patch.phone = body.phone;

  let updated: ProfileRow = target;
  if (Object.keys(patch).length > 0) {
    const { data, error } = await db
      .from("profiles")
      .update(patch)
      .eq("id", targetId)
      .select("id,email,full_name,phone,created_at")
      .single<ProfileRow>();
    if (error) throw error;
    updated = data;
  }

  // The membership is the authority the database reads; the claim is what
  // every Edge guard reads. Order matters: the membership is written first
  // and the claim second, so a failure can never leave an account with more
  // access than its claim advertises. If the claim write fails, the
  // membership is restored and nothing is changed.
  let roleChanged = false;
  if (body.role !== undefined) {
    const plan = planStaffRoleUpdate(body.role);
    roleChanged = (plan.membership.staff_role ?? "customer") !== currentRole;

    await writeMembership(db, tenantId, targetId, plan.membership.staff_role);

    const { data: authUser, error: authError } = await db.auth.admin.getUserById(targetId);
    const claimError = authError
      ? authError
      : (
        await db.auth.admin.updateUserById(targetId, {
          // Merge, never replace: a claim another tier owns (a tenant, say)
          // must survive a role change.
          app_metadata: {
            ...((authUser?.user.app_metadata as Record<string, unknown> | undefined) ?? {}),
            role: plan.auth.app_metadata.role,
          },
        })
      ).error;

    if (claimError) {
      await restoreMembership(db, tenantId, targetId, currentRole);
      throw new AppError("internal", "Could not update the staff role. Nothing was changed.");
    }
  }

  await writeAudit(
    {
      actorId: context.user.id,
      action: "admin.user.update",
      entity: "profiles",
      entityId: targetId,
      metadata: {
        ...patch,
        ...(body.role !== undefined ? { role: body.role } : {}),
        role_claim_updated: body.role !== undefined,
      },
    },
    db,
  );

  return ok(
    {
      ...toDto(updated, body.role ?? currentRole),
      // The claim travels in the access token, so an existing session keeps
      // the old role until the token is refreshed.
      roleAppliesAtNextSignIn: body.role !== undefined,
      roleChanged,
    },
    request,
  );
}

Deno.serve(serveJson(handler, ["GET", "PATCH"]));
