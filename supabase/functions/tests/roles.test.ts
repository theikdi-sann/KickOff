import { assertEquals, assertNotEquals } from "@std/assert";

import {
  STAFF_ROLES,
  isAdminRole,
  isStaffRole,
  planStaffRoleUpdate,
  staffRoleOf,
  staffRoleSchema,
} from "../_shared/roles.ts";

Deno.test("a role change is planned for the membership and the JWT claim together", () => {
  const plan = planStaffRoleUpdate("admin");

  // `staff_members` is what the database authorises on (`is_admin()`,
  // `is_staff()`, `is_gate_operator()` all read the membership).
  assertEquals(plan.membership.staff_role, "admin");
  // `app_metadata.role` is what every Edge Function guard reads — a role
  // change that skips it does not reach the gate surface.
  assertEquals(plan.auth.app_metadata.role, "admin");
});

Deno.test("a demotion plans the removal of the membership", () => {
  const plan = planStaffRoleUpdate("customer");

  // No membership is a customer: the row is removed, not written.
  assertEquals(plan.membership.staff_role, null);
  assertEquals(plan.auth.app_metadata.role, "customer");
});

Deno.test("the vocabulary is exactly customer, admin and gatekeeper", () => {
  assertEquals([...STAFF_ROLES], ["customer", "admin", "gatekeeper"]);
});

Deno.test("a gatekeeper role change is planned for both projections", () => {
  const plan = planStaffRoleUpdate("gatekeeper");

  assertEquals(plan.membership.staff_role, "gatekeeper");
  assertEquals(plan.auth.app_metadata.role, "gatekeeper");
});

Deno.test("the two projections of a role change never disagree", () => {
  for (const role of STAFF_ROLES) {
    const plan = planStaffRoleUpdate(role);
    assertEquals(plan.membership.staff_role ?? "customer", plan.auth.app_metadata.role);
  }
});

Deno.test("staffRoleOf only accepts the known role vocabulary", () => {
  assertEquals(staffRoleOf("admin"), "admin");
  assertEquals(staffRoleOf("gatekeeper"), "gatekeeper");
  assertEquals(staffRoleOf("customer"), "customer");
  assertEquals(staffRoleOf("superuser"), null);
  assertEquals(staffRoleOf(null), null);
  assertNotEquals(staffRoleOf(undefined), "admin");
});

Deno.test("isStaffRole accepts the two staff roles and rejects customers", () => {
  assertEquals(isStaffRole("admin"), true);
  assertEquals(isStaffRole("gatekeeper"), true);
  assertEquals(isStaffRole("customer"), false);
  assertEquals(isStaffRole("owner"), false);
  assertEquals(isStaffRole(undefined), false);
});

Deno.test("isAdminRole stays admin-only, so a gatekeeper is not an admin", () => {
  assertEquals(isAdminRole("admin"), true);
  assertEquals(isAdminRole("gatekeeper"), false);
  assertEquals(isAdminRole("customer"), false);
});

Deno.test("the shared schema parses every role and rejects anything else", () => {
  assertEquals(staffRoleSchema.safeParse("gatekeeper").success, true);
  assertEquals(staffRoleSchema.safeParse("admin").success, true);
  assertEquals(staffRoleSchema.safeParse("customer").success, true);
  assertEquals(staffRoleSchema.safeParse("owner").success, false);
});
