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
 * A staff member's authority lives in **two** places, and both must move
 * together (D-23):
 *
 *   - `public.staff_members` (with `public.staff_roles`) — the membership the
 *     *database* authorises on: `public.is_admin()`, `public.is_staff()` and
 *     `public.is_gate_operator()` all read it at the caller's club;
 *   - `auth.users.app_metadata.role` — the JWT claim every *Edge Function*
 *     guard authorises on.
 *
 * Writing only one changes what the product can do, not what it shows: a
 * membership without the claim still fails every Edge guard, and a claim
 * without the membership still fails every database check. Both projections
 * are therefore planned together here, so a role change cannot be
 * half-applied.
 *
 * `public.profiles.role` was a third projection, kept alive by a dual-write
 * trigger. It is legacy: the console and the `admin-users` function read the
 * membership instead, and `0048` drops the column with its trigger.
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
 * A role change, planned for both places the authority lives.
 */
export interface StaffRolePlan {
  /**
   * The membership write — `staff_members.staff_role` at the caller's club.
   * `null` means no membership: the row is removed, not written.
   */
  membership: { staff_role: StaffRole | null };
  /** Patch for `auth.users` app metadata — what the Edge guards authorise on. */
  auth: { app_metadata: { role: StaffRole } };
}

/**
 * Plans a role change for the membership and the JWT claim together.
 *
 * The two projections must never disagree, so they are derived from one
 * value instead of being written separately.
 */
export function planStaffRoleUpdate(role: StaffRole): StaffRolePlan {
  return {
    membership: { staff_role: role === 'customer' ? null : role },
    auth: { app_metadata: { role } },
  };
}

/** Narrows an unknown value to the staff role vocabulary. */
export function staffRoleOf(value: unknown): StaffRole | null {
  const parsed = staffRoleSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
