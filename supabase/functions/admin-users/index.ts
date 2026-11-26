import { z } from "zod";

import { writeAudit } from "../_shared/audit.ts";
import { requireCapability, type AuthContext } from "../_shared/auth.ts";
import type { Database } from "../_shared/database.types.ts";
import { AppError } from "../_shared/errors.ts";
import { ok, serveJson } from "../_shared/http.ts";
import type { Capability } from "../_shared/roles.ts";
import { serviceClient } from "../_shared/supabase.ts";
import { validateBody, validateQuery } from "../_shared/validate.ts";

const listQuerySchema = z.object({
  role: z.string().regex(/^[a-z][a-z0-9_]*$/).optional(),
  page: z.coerce.number().int().min(1).max(1000).default(1),
  perPage: z.coerce.number().int().min(1).max(100).default(50),
});

const patchSchema = z
  .object({
    id: z.string().min(1).max(64).optional(),
    role: z.string().regex(/^[a-z][a-z0-9_]*$/).optional(),
    fullName: z.string().trim().min(1).max(120).optional(),
    phone: z.string().max(32).nullable().optional(),
    /** Fan lifecycle. Staff use `role`/Remove staff instead. */
    fanStatus: z.enum(["active", "suspended", "deleted"]).optional(),
  })
  .refine(
    (value) =>
      value.role !== undefined ||
      value.fullName !== undefined ||
      value.phone !== undefined ||
      value.fanStatus !== undefined,
    "Nothing to update",
  )
  .refine(
    (value) => !(value.role !== undefined && value.fanStatus !== undefined),
    "A role change and a fan status change cannot be combined",
  );

/**
 * RBAC-9 — an administrator creates a staff account with the initial password
 * they hand to the staff member. A customer is never promoted by a PATCH.
 */
const createStaffSchema = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(8).max(72),
  fullName: z.string().trim().min(1).max(120).optional(),
  role: z
    .string()
    .regex(/^[a-z][a-z0-9_]{1,30}$/)
    .refine((value) => value !== "customer", "customer is not a staff role"),
});

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

function toDto(row: ProfileRow, role: string, fanStatus: FanStatus = "active") {
  return {
    id: row.id,
    email: row.email,
    fullName: row.full_name,
    role,
    fanStatus,
    phone: row.phone,
    joinedAt: row.created_at,
  };
}

type FanStatus = "active" | "suspended" | "deleted";

/** The fan lifecycle state, defaulting to active when no `fans` row exists. */
async function fanStatusOf(db: ReturnType<typeof serviceClient>, userId: string): Promise<FanStatus> {
  const { data, error } = await db
    .from("fans")
    .select("status")
    .eq("id", userId)
    .maybeSingle<{ status: FanStatus }>();
  if (error) throw error;
  return data?.status ?? "active";
}

/**
 * Applies a fan lifecycle state to both projections: the `fans` row the
 * console reads and the auth user's ability to sign in / refresh a token.
 */
async function writeFanStatus(
  db: ReturnType<typeof serviceClient>,
  userId: string,
  status: FanStatus,
): Promise<FanStatus> {
  const current = await fanStatusOf(db, userId);
  if (current === "deleted" && status !== "deleted") {
    throw new AppError("conflict", "A deleted fan cannot be restored");
  }
  if (current === status) return status;

  if (status === "suspended") {
    const { error } = await db.auth.admin.updateUserById(userId, {
      ban_duration: "876000h",
    });
    if (error) throw error;
  } else if (status === "active") {
    const { error } = await db.auth.admin.updateUserById(userId, {
      ban_duration: "none",
    });
    if (error) throw error;
  } else {
    // Soft delete: the auth user row stays for the audit trail and cannot sign in.
    const { error } = await db.auth.admin.deleteUser(userId, true);
    if (error) throw error;
  }

  const now = new Date().toISOString();
  const { error } = await db.from("fans").upsert(
    {
      id: userId,
      status,
      suspended_at: status === "suspended" ? now : null,
      deleted_at: status === "deleted" ? now : null,
    },
    { onConflict: "id" },
  );
  if (error) throw error;
  return status;
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
  staffRole: string | null,
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


async function handler(request: Request): Promise<Response> {
  const context = await requireCapability(request, "manage_staff");
  const db = serviceClient();

  if (request.method === "GET") {
    const { role, page, perPage } = validateQuery(request, listQuerySchema);
    const from = (page - 1) * perPage;

    const memberships = await clubMemberships(context);
    const roles = new Map(memberships.map((m) => [m.id, m.staff_role]));
    const { data: fanRows, error: fanError } = await db.from("fans").select("id,status");
    if (fanError) throw fanError;
    const fanStatuses = new Map(
      ((fanRows ?? []) as Array<{ id: string; status: FanStatus }>).map((row) => [row.id, row.status]),
    );

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
      .map((row) =>
        toDto(
          row,
          (roles.get(row.id) as string | undefined) ?? "customer",
          fanStatuses.get(row.id) ?? "active",
        ),
      )
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

  // RBAC-9 — create the account, then let the service-only RPC write the
  // membership. The claim is set at creation so the account's first session
  // carries the right role; the DB function re-checks escalation.
  if (request.method === "POST") {
    const input = await validateBody(request, createStaffSchema);
    const tenantId = await callerClub(context);

    const { data: roleRow, error: roleError } = await db
      .from("staff_roles")
      .select("code,active")
      .eq("tenant_id", tenantId)
      .eq("code", input.role)
      .maybeSingle<{ code: string; active: boolean }>();
    if (roleError) throw roleError;
    if (!roleRow?.active) {
      throw new AppError("validation", "Role not found or inactive");
    }

    const { data: caps, error: capError } = await db
      .from("staff_role_capabilities")
      .select("capability")
      .eq("tenant_id", tenantId)
      .eq("role_code", input.role);
    if (capError) throw capError;
    const capabilities = ((caps ?? []) as Array<{ capability: Capability }>).map(
      (row) => row.capability,
    );
    if (capabilities.length === 0) {
      throw new AppError("validation", "Role not found or inactive");
    }

    const created = await db.auth.admin.createUser({
      email: input.email,
      password: input.password,
      email_confirm: true,
      user_metadata: { full_name: input.fullName ?? "" },
      app_metadata: { role: input.role, capabilities },
    });
    if (created.error || !created.data.user) {
      throw new AppError("conflict", created.error?.message ?? "Could not create the account");
    }
    const userId = created.data.user.id;

    const assigned = await db.rpc("admin_create_staff_member", {
      p_actor_id: context.user.id,
      p_tenant_id: tenantId,
      p_user_id: userId,
      p_role: input.role,
    });
    if (assigned.error) {
      // The auth user must not survive a refused membership.
      await db.auth.admin.deleteUser(userId);
      throw assigned.error;
    }

    const { data: profile, error: profileError } = await db
      .from("profiles")
      .select("id,email,full_name,phone,created_at")
      .eq("id", userId)
      .single<ProfileRow>();
    if (profileError) {
      await db.auth.admin.deleteUser(userId);
      throw profileError;
    }

    return ok(
      {
        user: toDto(profile, input.role),
        roleAppliesAtNextSignIn: false,
        roleChanged: true,
      },
      request,
    );
  }

  // PATCH
  const body = await validateBody(request, patchSchema);
  const targetId = body.id ?? idFromRequest(request);
  if (!targetId) throw new AppError("validation", "Missing user id");

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
    memberships.find((m) => m.id === targetId)?.staff_role ?? "customer";

  // RBAC-9 — the database refuses this too; the Edge check keeps the public
  // error stable and avoids creating a claim for a promotion that cannot land.
  if (body.role !== undefined && body.role !== "customer" && currentRole === "customer") {
    throw new AppError("conflict", "customer_not_staff");
  }

  // REQ-26 — fan lifecycle. Staff are never suspended/deleted from here; their
  // access is removed through the role path.
  let fanStatus = await fanStatusOf(db, targetId);
  if (body.fanStatus !== undefined) {
    if (currentRole !== "customer") {
      throw new AppError("conflict", "staff_status_not_fan");
    }
    fanStatus = await writeFanStatus(db, targetId, body.fanStatus);
  }

  const patch: Database["public"]["Tables"]["profiles"]["Update"] = {};
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

  // The membership is the authority; the claim is what every Edge guard reads.
  // Both move together: the RPC enforces escalation/self-demotion/last-manager
  // guards, and the claim is compensated back if it fails.
  let roleChanged = false;
  let assignedCapabilities: Capability[] = [];
  if (body.role !== undefined) {
    roleChanged = body.role !== currentRole;

    const assigned = await context.client.rpc("admin_assign_role", {
      p_user_id: targetId,
      p_role: body.role,
    });
    if (assigned.error) throw assigned.error;

    if (body.role !== "customer") {
      const { data: caps, error: capError } = await db
        .from("staff_role_capabilities")
        .select("capability")
        .eq("tenant_id", tenantId)
        .eq("role_code", body.role);
      if (capError) throw capError;
      assignedCapabilities = ((caps ?? []) as Array<{ capability: Capability }>).map(
        (row) => row.capability,
      );
    }

    const { data: authUser, error: authError } = await db.auth.admin.getUserById(targetId);
    const claimError = authError
      ? authError
      : (
        await db.auth.admin.updateUserById(targetId, {
          app_metadata: {
            ...((authUser?.user.app_metadata as Record<string, unknown> | undefined) ?? {}),
            role: body.role,
            capabilities: assignedCapabilities,
          },
        })
      ).error;

    if (claimError) {
      await writeMembership(db, tenantId, targetId, currentRole === "customer" ? null : currentRole);
      throw new AppError("internal", "Could not update the staff role. Nothing was changed.");
    }
  }

  await writeAudit(
    {
      actorId: context.user.id,
      action:
        body.fanStatus === "suspended"
          ? "admin.user.suspend"
          : body.fanStatus === "deleted"
            ? "admin.user.delete"
            : body.fanStatus === "active"
              ? "admin.user.restore"
              : "admin.user.update",
      entity: "profiles",
      entityId: targetId,
      metadata: {
        ...patch,
        ...(body.role !== undefined ? { role: body.role } : {}),
        ...(body.fanStatus !== undefined ? { fan_status: body.fanStatus } : {}),
        role_claim_updated: body.role !== undefined,
      },
    },
    db,
  );

  return ok(
    {
      ...toDto(updated, body.role ?? currentRole, fanStatus),
      // The claim travels in the access token, so an existing session keeps
      // the old role until the token is refreshed.
      roleAppliesAtNextSignIn: body.role !== undefined,
      roleChanged,
    },
    request,
  );
}

Deno.serve(serveJson(handler, ["GET", "POST", "PATCH"]));
