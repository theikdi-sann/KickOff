"use client";

import type { User } from "@supabase/supabase-js";
import { isAdminRole, isPlatformMetadata, isStaffRole, staffRoleOf, type StaffRole } from "@kickoff/shared";
import { identify, reset, track } from "@/lib/analytics";
import { createClient } from "@/lib/supabase/client";

/** The caller's role claim, or null when it is missing or unknown. */
export function roleOf(user: User | null | undefined): StaffRole | null {
  const metadata = user?.app_metadata as Record<string, unknown> | undefined;
  return staffRoleOf(metadata?.role);
}

/** True for an admin — the only role that may manage the club. */
export function isAdminUser(user: User | null | undefined): boolean {
  const metadata = user?.app_metadata as Record<string, unknown> | undefined;
  return isAdminRole(metadata?.role);
}

/** True for either staff role — an admin or a gatekeeper. */
export function isStaffUser(user: User | null | undefined): boolean {
  const metadata = user?.app_metadata as Record<string, unknown> | undefined;
  return isStaffRole(metadata?.role);
}

/**
 * True for a platform operator — the claim `set_platform_admin` writes to
 * both projections (0054).
 *
 * Deliberately *not* club authority: a club admin is not a platform
 * operator, and a platform operator holds no club staff role unless the
 * membership says so. The read goes through the shared vocabulary so the
 * key cannot drift from the Edge guards' or the database's.
 */
export function isPlatformUser(user: User | null | undefined): boolean {
  return isPlatformMetadata(user?.app_metadata);
}

export async function signIn(email: string, password: string): Promise<User> {
  const supabase = createClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.trim(),
    password,
  });
  if (error) throw new Error(error.message);
  if (!data.user) throw new Error("Sign-in returned no user");
  identify(data.user.id, {
    email: data.user.email ?? "",
    role: roleOf(data.user) ?? "customer",
  });
  track("admin_signed_in");
  return data.user;
}

export async function signOut(): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.auth.signOut();
  if (error) throw new Error(error.message);
  reset();
}

/** True when the account still needs a TOTP challenge (aal1 → aal2). */
export async function needsMfa(): Promise<boolean> {
  const supabase = createClient();
  const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (error) return false;
  return data.nextLevel === "aal2" && data.currentLevel !== "aal2";
}
