// RBAC-9 — staff accounts are created, not promoted.
//
// The Users screen must not expose a role selector for a customer: the
// database refuses customer → staff through the update RPC. Keeping the
// decision in a pure helper gives the UI and the tests one rule.
import test from "node:test";
import assert from "node:assert/strict";
import { canEditRole, createStaffRoles, fanStatusLabel, roleDisplayName } from "../src/lib/staff.ts";

test("a customer row cannot be edited into a staff role", () => {
  assert.equal(canEditRole("customer"), false);
});

test("an existing staff member can still be reassigned or demoted", () => {
  assert.equal(canEditRole("admin"), true);
  assert.equal(canEditRole("gatekeeper"), true);
  assert.equal(canEditRole("box_office"), true);
});

test("the create-staff role list never offers customer", () => {
  const roles = createStaffRoles([
    { code: "admin", name: "Admin" },
    { code: "gatekeeper", name: "Gatekeeper" },
    { code: "customer", name: "Customer" },
  ]);

  assert.deepEqual(
    roles.map((role) => role.code),
    ["admin", "gatekeeper"],
  );
});

test("a customer is displayed as FAN — fans are the people table", () => {
  assert.equal(
    roleDisplayName("customer", [{ code: "admin", name: "Admin" }]),
    "FAN",
  );
  assert.equal(
    roleDisplayName("gatekeeper", [{ code: "gatekeeper", name: "Gatekeeper" }]),
    "GATEKEEPER",
  );
});

test("the staff role selector excludes the fan/customer state", () => {
  const choices = createStaffRoles([
    { code: "admin", name: "Admin" },
    { code: "gatekeeper", name: "Gatekeeper" },
  ]);

  assert.equal(
    choices.some((role) => role.code === "customer"),
    false,
    "demotion is a separate Remove staff action, not a role choice",
  );
});

test("a fan badge carries the lifecycle state", () => {
  assert.equal(fanStatusLabel("active"), "FAN");
  assert.equal(fanStatusLabel("suspended"), "FAN · SUSPENDED");
  assert.equal(fanStatusLabel("deleted"), "FAN · DELETED");
});
