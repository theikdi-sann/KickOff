/**
 * The staff role contract.
 *
 * A staff member's role lives in **two** places, and both must move together:
 *
 *   - `public.profiles.role` — the row the staff console reads and displays.
 *   - `auth.users.app_metadata.role` — the JWT claim that `public.is_admin()`
 *     and every Edge Function guard actually authorises on.
 *
 * Writing only the profile row changes what the console *shows* without
 * changing what the user *can do*: the promoted account still fails every
 * `is_admin()` check, and the demoted account keeps its access until its
 * token is refreshed. Both projections are therefore planned together here,
 * so a role change cannot be half-applied.
 */

import { z } from "zod";

/** The role vocabulary shared by the database, the JWT claim and the UI. */
export const STAFF_ROLES = ["customer", "admin"] as const;

export type StaffRole = (typeof STAFF_ROLES)[number];

/** The role of a signed-in user, read from the JWT claim. */
export const staffRoleSchema = z.enum(STAFF_ROLES);

/**
 * A role change, planned for both places the role lives.
 */
export interface StaffRolePlan {
  /** Patch for `public.profiles` — what the console displays. */
  profile: { role: StaffRole };
  /** Patch for `auth.users` app metadata — what the guards authorise on. */
  auth: { app_metadata: { role: StaffRole } };
}

/**
 * Plans a role change for the profile row and the JWT claim together.
 *
 * The two projections must never disagree, so they are derived from one
 * value instead of being written separately.
 */
export function planStaffRoleUpdate(role: StaffRole): StaffRolePlan {
  return {
    profile: { role },
    auth: { app_metadata: { role } },
  };
}

/** Narrows an unknown value to the staff role vocabulary. */
export function staffRoleOf(value: unknown): StaffRole | null {
  return value === "admin" || value === "customer" ? value : null;
}
