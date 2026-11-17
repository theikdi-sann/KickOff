/**
 * The platform surface's vocabulary — one owner for the claim the console and
 * the Edge guards read, and for the slug every tier validates a club by
 * (ADR-004 §1/§3, migration 0054).
 *
 * Three projections must agree on what a platform operator *is*, exactly like
 * the staff-role contract in `roles.ts` (D-16):
 *
 *   - `public.platform_admins` — the membership the database reads
 *     (`is_platform_admin()`);
 *   - `auth.users.app_metadata.platform` — the claim this module reads;
 *   - the console UI, which hides the platform surface from everyone else.
 *
 * The slug pattern is the database's own (`tenants.slug`'s check, 0040): a
 * white-label build binds to a club by slug at sign-in (`bootstrap`), so a
 * slug the database would refuse must never be sent to it.
 *
 * This file is deliberately import-free: `scripts/sync-edge-schemas.mjs`
 * generates the deployed Edge copy from it, and a reader can diff the two by
 * eye (MF-1/PC-2).
 */

/** The `app_metadata` key that marks a platform operator (0054). */
export const PLATFORM_CLAIM_KEY = 'platform';

/**
 * True when app metadata carries the platform claim.
 *
 * Strictly `true` — the claim is written as a boolean by `set_platform_admin`
 * and read by every guard, so a truthy string from a hand-edited token is
 * refused rather than believed.
 */
export function isPlatformMetadata(metadata: unknown): boolean {
  if (typeof metadata !== 'object' || metadata === null) return false;
  return (metadata as Record<string, unknown>)[PLATFORM_CLAIM_KEY] === true;
}

/** The slug shape `tenants.slug` accepts (0040): lowercase, single hyphens. */
export const CLUB_SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** True for a slug the database would accept for a club. */
export function isValidClubSlug(slug: unknown): slug is string {
  return typeof slug === 'string' && CLUB_SLUG_PATTERN.test(slug);
}

/** The uuid shape every tenant id has (0040's primary key). */
const TENANT_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** The `app_metadata` claim a session bound to a club carries (D-29). */
export interface BootstrapClaim {
  tenant_id: string;
}

/**
 * The claim `bootstrap` writes for a session, as a plan — the same shape the
 * staff-role contract plans (`planStaffRoleUpdate`): the part a test can pin
 * without a network call, kept separate from the write that performs it.
 *
 * @param tenantId the club the session is bound to
 * @returns the claim to merge into `app_metadata`
 * @throws RangeError naming the bad id, before anything is written
 */
export function planBootstrapClaim(tenantId: string): BootstrapClaim {
  if (typeof tenantId !== 'string' || !TENANT_ID_PATTERN.test(tenantId)) {
    throw new RangeError(`planBootstrapClaim expects a tenant uuid, got ${String(tenantId)}`);
  }
  return { tenant_id: tenantId };
}
