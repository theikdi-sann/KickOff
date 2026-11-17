import type { SupabaseClient, User } from "@supabase/supabase-js";

import { AppError } from "./errors.ts";
import { isPlatformMetadata } from "./platform.ts";
import { isAdminRole, isStaffRole } from "./roles.ts";
import { userClient } from "./supabase.ts";

export interface AuthContext {
  user: User;
  client: SupabaseClient;
  accessToken: string;
}

function bearerToken(request: Request): string | null {
  const header = request.headers.get("authorization");
  if (!header) return null;
  const [scheme, token] = header.split(" ");
  if (!token || scheme?.toLowerCase() !== "bearer") return null;
  return token;
}

export function isAdmin(user: User): boolean {
  const appMetadata = user.app_metadata as Record<string, unknown> | undefined;
  return isAdminRole(appMetadata?.role);
}

/** True for either staff role — an admin or a gatekeeper. */
export function isStaff(user: User): boolean {
  const appMetadata = user.app_metadata as Record<string, unknown> | undefined;
  return isStaffRole(appMetadata?.role);
}

/**
 * True for a platform operator — the claim `set_platform_admin` writes to
 * both projections (0054), read through the shared vocabulary so the key
 * cannot drift from the console's or the database's.
 *
 * This is *not* club authority: a club admin is not a platform operator, and
 * a platform operator holds no club staff role unless they also have one.
 */
export function isPlatformAdmin(user: User): boolean {
  return isPlatformMetadata(user.app_metadata);
}

/** Validates the caller's JWT with Supabase Auth and returns a scoped client. */
export async function requireUser(request: Request): Promise<AuthContext> {
  const token = bearerToken(request);
  if (!token) throw new AppError("unauthorized", "Missing bearer token");

  const client = userClient(token);
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user) throw new AppError("unauthorized", "Invalid or expired session");

  return { user: data.user, client, accessToken: token };
}

/** Requires a signed-in user whose `app_metadata.role` is `admin`. */
export async function requireAdmin(request: Request): Promise<AuthContext> {
  const context = await requireUser(request);
  if (!isAdmin(context.user)) {
    throw new AppError("forbidden", "Admin access required");
  }
  return context;
}

/**
 * Requires a signed-in staff member — `admin` or `gatekeeper`.
 *
 * Only the gate surface may use this guard. Everything else is admin-only:
 * a gatekeeper's authority is exactly "scan and undo your own scan", so a
 * broader guard would quietly widen it.
 */
export async function requireStaff(request: Request): Promise<AuthContext> {
  const context = await requireUser(request);
  if (!isStaff(context.user)) {
    throw new AppError("forbidden", "Staff access required");
  }
  return context;
}

/**
 * Requires a signed-in platform operator (ADR-004 §3).
 *
 * Only the platform Edge surface may use this guard: provisioning, fee rates
 * and Stripe onboarding act across clubs, and club staff authority
 * (`requireAdmin`) is deliberately scoped to one club — it must never
 * satisfy this.
 */
export async function requirePlatformAdmin(request: Request): Promise<AuthContext> {
  const context = await requireUser(request);
  if (!isPlatformAdmin(context.user)) {
    throw new AppError("forbidden", "Platform access required");
  }
  return context;
}
