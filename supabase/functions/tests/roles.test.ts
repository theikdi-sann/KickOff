import { assertEquals, assertNotEquals } from "@std/assert";

import { planStaffRoleUpdate, staffRoleOf } from "../_shared/roles.ts";

Deno.test("a role change is planned for the profile row and the JWT claim together", () => {
  const plan = planStaffRoleUpdate("admin");

  // `profiles.role` is what the staff console displays.
  assertEquals(plan.profile.role, "admin");
  // `app_metadata.role` is what `public.is_admin()` and every Edge Function
  // guard actually read — a role change that skips it grants nothing.
  assertEquals(plan.auth.app_metadata.role, "admin");
});

Deno.test("a demotion is planned for the profile row and the JWT claim together", () => {
  const plan = planStaffRoleUpdate("customer");

  assertEquals(plan.profile.role, "customer");
  assertEquals(plan.auth.app_metadata.role, "customer");
});

Deno.test("the two projections of a role change never disagree", () => {
  for (const role of ["admin", "customer"] as const) {
    const plan = planStaffRoleUpdate(role);
    assertEquals(plan.profile.role, plan.auth.app_metadata.role);
  }
});

Deno.test("staffRoleOf only accepts the known role vocabulary", () => {
  assertEquals(staffRoleOf("admin"), "admin");
  assertEquals(staffRoleOf("customer"), "customer");
  assertEquals(staffRoleOf("superuser"), null);
  assertEquals(staffRoleOf(null), null);
  assertNotEquals(staffRoleOf(undefined), "admin");
});
