/**
 * RBAC-9 — a customer is not a role and is not editable through the Users
 * screen. Staff accounts are created deliberately by an administrator, so the
 * table only exposes a role selector for an existing staff member.
 */

export interface StaffRoleOption {
  code: string;
  name: string;
}

/** True when this row already holds a staff membership and may be reassigned. */
export function canEditRole(role: string): boolean {
  return role !== "customer";
}

/** The roles an admin may start a new staff account with — never Customer. */
export function createStaffRoles<T extends StaffRoleOption>(roles: readonly T[]): T[] {
  return roles.filter((role) => role.code !== "customer");
}

/**
 * How the Users screen names a role. `customer` is the database/claim value
 * for "no staff membership"; people are fans (`fans` table), so the console
 * displays FAN rather than CUSTOMER.
 */
export function roleDisplayName(
  role: string,
  roles: readonly StaffRoleOption[],
): string {
  if (role === "customer") return "FAN";
  return roles.find((entry) => entry.code === role)?.name.toUpperCase() ?? role.toUpperCase();
}

/** The badge for a fan's lifecycle state. */
export function fanStatusLabel(status: "active" | "suspended" | "deleted"): string {
  if (status === "suspended") return "FAN · SUSPENDED";
  if (status === "deleted") return "FAN · DELETED";
  return "FAN";
}
