// GENERATED FILE — do not edit.
// Source: packages/shared/src/roles.ts
// Regenerate: node scripts/sync-edge-schemas.mjs
//
// Supabase deploys only `supabase/functions/**`, so this copy cannot be an
// import from `@kickoff/shared`. It is generated from the canonical source,
// and a contract test fails if it drifts.

/**
 * The staff role contract — the one vocabulary every tier agrees on.
 *
 * A staff member's role lives in **two** places, and both must move together
 * (D-16):
 *
 *   - `public.profiles.role` — the row the staff console reads and displays;
 *   - `auth.users.app_metadata.role` — the JWT claim that `public.is_admin()`,
 *     `public.is_staff()` and every Edge Function guard authorise on.
 *
 * Writing only the profile row changes what the console *shows* without
 * changing what the user *can do*: the promoted account still fails every
 * privilege check, and the demoted account keeps its access until its token
 * is refreshed. Both projections are therefore planned together here, so a
 * role change cannot be half-applied.
 *
 * The vocabulary is exactly two staff roles (D-20): `admin` keeps every
 * privilege, `gatekeeper` may scan passes and undo their own scans. This file
 * is the canonical source; the deployed Edge copy
 * (`supabase/functions/_shared/roles.ts`) is generated from it, because Supabase
 * deploys only `supabase/functions/**`.
 */

import { z } from 'zod';

/** The role vocabulary shared by the database, the JWT claim and the UI. */
export const STAFF_ROLES = ['customer', 'admin', 'gatekeeper'] as const;

export type StaffRole = (typeof STAFF_ROLES)[number];

/** The role of a signed-in user, read from the JWT claim. */
export const staffRoleSchema = z.enum(STAFF_ROLES);

/** True for the role that keeps every privilege. */
export function isAdminRole(value: unknown): boolean {
  return value === 'admin';
}

/** True for a role that may work the gate (admin or gatekeeper). */
export function isStaffRole(value: unknown): boolean {
  return value === 'admin' || value === 'gatekeeper';
}

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
  const parsed = staffRoleSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
