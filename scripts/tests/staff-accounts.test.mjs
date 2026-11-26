// RBAC-9 — staff accounts are created by an admin, never promoted from a
// customer. The rule has to hold at all three tiers:
//
//   * database: `admin_assign_role` refuses customer → staff;
//   * Edge: `admin-users` has a create path built on the service-only
//     `admin_create_staff_member` RPC, and keeps PATCH for existing staff;
//   * console: a customer row has no role selector, and the create form asks
//     for the e-mail + initial password the admin hands over.
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..", "..");
const read = (path) => readFileSync(resolve(root, path), "utf8");

const adminUsers = read("supabase/functions/admin-users/index.ts");
const usersPage = read("apps/admin/src/app/dashboard/users/page.tsx");
const usersQuery = read("apps/admin/src/lib/queries/users.ts");
const securityPage = read("apps/admin/src/app/dashboard/settings/mfa/page.tsx");
const requirements = read("docs/REQUIREMENTS.md");
const testing = read("docs/TESTING.md");

const MIGRATION = "supabase/migrations/0072_staff_accounts.sql";

test("RBAC-9 the database refuses to promote a customer", () => {
  assert.ok(existsSync(resolve(root, MIGRATION)), `${MIGRATION} must exist`);
  const migration = read(MIGRATION);

  assert.match(
    migration,
    /v_current is null and p_role <> 'customer'[\s\S]{0,120}customer_not_staff/,
    "admin_assign_role must refuse customer → staff with customer_not_staff",
  );
  assert.match(
    migration,
    /admin_create_staff_member/,
    "staff creation needs its own service-only RPC",
  );
});

test("RBAC-9 admin-users creates the auth user, membership and claim", () => {
  assert.match(adminUsers, /request\.method === "POST"|request\.method !== "PATCH"/);
  assert.match(adminUsers, /auth\.admin\.createUser/, "the create path must make the auth user");
  assert.match(
    adminUsers,
    /admin_create_staff_member/,
    "the create path must write the membership through the guarded RPC",
  );
  assert.match(adminUsers, /customer_not_staff|A customer cannot be promoted/);
  assert.match(adminUsers, /password/, "the administrator supplies the initial password");
});

test("RBAC-9 the Users screen does not offer a role selector for customers", () => {
  assert.match(usersPage, /canEditRole/, "the row decision must come from the shared helper");
  assert.match(usersPage, /Create staff/, "the admin needs an explicit create action");
  assert.match(usersQuery, /useCreateStaff/, "the create action needs its own mutation");
  assert.doesNotMatch(
    usersPage,
    /\{assignable\.map\(\(role\)/,
    "customer rows must not render the staff-role selector",
  );
});

test("RBAC-9 the Users screen calls the no-membership state Fan", () => {
  assert.match(usersPage, /roleDisplayName/, "the label must come from the shared helper");
  assert.match(usersPage, /roleChoices = createStaffRoles/, "staff rows only choose staff roles");
  assert.match(usersPage, /Remove staff/, "removing access is a separate action");
  assert.match(
    usersPage,
    /label: "Fans"/,
    "the filter must say Fans, matching the fans table",
  );
});

test("REQ-26 a fan can be suspended or soft-deleted", () => {
  const migration = read("supabase/migrations/0073_fan_status.sql");
  assert.match(migration, /status text not null default 'active'/);
  assert.match(migration, /'active'.*'suspended'.*'deleted'/s);
  assert.match(usersPage, /fanStatusLabel/, "the badge must show the lifecycle state");
  assert.match(usersPage, /Suspend/, "a fan row offers Suspend");
  assert.match(usersPage, /Soft delete/, "a fan row offers Soft delete");
  assert.match(usersQuery, /fanStatus/, "the query carries the fan state");
});

test("RBAC-9 a new staff member can change the initial password", () => {
  assert.match(
    securityPage,
    /auth\.updateUser\(\{\s*password/,
    "the Security screen must let the signed-in staff member change the password",
  );
});

test("RBAC-9 the requirement and acceptance table name the rule", () => {
  assert.match(requirements, /RBAC-1…RBAC-9/);
  assert.match(requirements, /Staff accounts are \*\*created\*\*/);
  assert.match(testing, /RBAC-9/);
  assert.match(testing, /fan cannot be promoted|customer cannot be promoted|customer can(?:no|')t be promoted/i);
});
