import { assertEquals, assertExists, assert } from "@std/assert";

import { RUN, authAdmin, invoke, login, requireEnv, rest } from "./_commerce.ts";

type Env = ReturnType<typeof requireEnv>;

function adminToken(env: Env): Promise<string> {
  return login(env, Deno.env.get("ADMIN_EMAIL") ?? "admin@kickoff.app",
    Deno.env.get("ADMIN_PASSWORD") ?? "kickoffadmin");
}

Deno.test({
  name: "RBAC-8 the console can list, create and delete a custom role",
  ignore: !RUN,
  fn: async () => {
    const env = requireEnv();
    const admin = await adminToken(env);
    const code = `test_${crypto.randomUUID().slice(0, 8)}`;

    // The console list is a GET; this is the path the browser uses on page
    // load, so exercise it explicitly instead of relying on a mutation's
    // response to carry the list.
    const listed = await invoke<{ roles: Array<{ code: string; isSystem: boolean }> }>(
      env,
      "admin-roles",
      { token: admin, method: "GET" },
    );
    assertEquals(listed.status, 200, JSON.stringify(listed.body));
    const builtIns = listed.body.data?.roles.filter((entry) => entry.isSystem).map((entry) =>
      entry.code
    );
    assertEquals(builtIns?.sort(), ["admin", "gatekeeper"]);

    try {
      const created = await invoke<{ roles: Array<{ code: string; capabilities: string[] }> }>(
        env,
        "admin-roles",
        {
          token: admin,
          method: "POST",
          body: {
            code,
            name: "Test Box Office",
            capabilities: ["manage_matches", "view_reports"],
          },
        },
      );
      assertEquals(created.status, 200, JSON.stringify(created.body));
      const role = created.body.data?.roles.find((entry) => entry.code === code);
      assertExists(role);
      assertEquals(role.capabilities.sort(), ["manage_matches", "view_reports"]);

      const deleted = await invoke(env, "admin-roles", {
        token: admin,
        method: "DELETE",
        body: { code },
      });
      assertEquals(deleted.status, 200);
    } finally {
      await rest(env, `staff_roles?code=eq.${code}`, {
        token: env.service,
        method: "DELETE",
      });
    }
  },
});

Deno.test({
  name: "RBAC-9 an admin creates staff accounts; a customer cannot be promoted",
  ignore: !RUN,
  fn: async () => {
    const env = requireEnv();
    const admin = await adminToken(env);
    const tag = crypto.randomUUID().slice(0, 8);
    const customerEmail = `customer_${tag}@kickoff.test`;
    const customerPassword = "customer-pass-123";
    const staffEmail = `staff_${tag}@kickoff.test`;
    const staffPassword = "initial-staff-pass-123";

    const customer = await authAdmin<{ user?: { id: string }; id?: string }>(env, "users", {
      method: "POST",
      body: {
        email: customerEmail,
        password: customerPassword,
        email_confirm: true,
        app_metadata: { role: "customer" },
      },
    });
    const customerId = customer.body.user?.id ?? customer.body.id;
    assertExists(customerId);

    let staffId: string | undefined;
    try {
      // A PATCH cannot turn a customer into staff.
      const promoted = await invoke(env, "admin-users", {
        token: admin,
        method: "PATCH",
        body: { id: customerId, role: "gatekeeper" },
      });
      assertEquals(promoted.status, 409, JSON.stringify(promoted.body));
      assert(
        (promoted.body.error?.message ?? "").includes("customer_not_staff"),
        "the refusal names customer_not_staff",
      );

      const stillCustomer = await rest<Array<{ staff_role: string }>>(
        env,
        `staff_members?id=eq.${customerId}&select=staff_role`,
        { token: env.service },
      );
      assertEquals(stillCustomer.length, 0, "the refused promotion wrote no membership");

      // A customer also cannot call the create endpoint.
      const customerToken = await login(env, customerEmail, customerPassword);
      const refused = await invoke(env, "admin-users", {
        token: customerToken,
        method: "POST",
        body: { email: `nope_${tag}@kickoff.test`, password: "nope-pass-123", role: "gatekeeper" },
      });
      assertEquals(refused.status, 403, JSON.stringify(refused.body));

      // An admin creates the staff account with its initial password.
      const created = await invoke<{ user: { id: string; role: string } }>(env, "admin-users", {
        token: admin,
        method: "POST",
        body: {
          email: staffEmail,
          password: staffPassword,
          fullName: "Created Gatekeeper",
          role: "gatekeeper",
        },
      });
      assertEquals(created.status, 200, JSON.stringify(created.body));
      staffId = created.body.data?.user.id;
      assertExists(staffId);
      assertEquals(created.body.data?.user.role, "gatekeeper");

      const membership = await rest<Array<{ staff_role: string }>>(
        env,
        `staff_members?id=eq.${staffId}&select=staff_role`,
        { token: env.service },
      );
      assertEquals(membership[0]?.staff_role, "gatekeeper");

      const authUser = await authAdmin<{
        user?: { app_metadata?: { role?: string; capabilities?: string[] } };
        app_metadata?: { role?: string; capabilities?: string[] };
      }>(env, `users/${staffId}`);
      const metadata = authUser.body.user?.app_metadata ?? authUser.body.app_metadata;
      assertEquals(metadata?.role, "gatekeeper");
      assertEquals(metadata?.capabilities, ["operate_gate"]);

      // The initial password works, and the account can change it later.
      const firstSignIn = await login(env, staffEmail, staffPassword);
      assert(firstSignIn.length > 0, "the created account can sign in");
    } finally {
      if (staffId) await authAdmin(env, `users/${staffId}`, { method: "DELETE" });
      await authAdmin(env, `users/${customerId}`, { method: "DELETE" });
    }
  },
});

Deno.test({
  name: "RBAC-3 assignment writes the membership and the capability claim",
  ignore: !RUN,
  fn: async () => {
    const env = requireEnv();
    const admin = await adminToken(env);
    const code = `assign_${crypto.randomUUID().slice(0, 8)}`;
    const email = `${code}@kickoff.test`;

    const createdRole = await invoke(env, "admin-roles", {
      token: admin,
      method: "POST",
      body: { code, name: "Assignment Test", capabilities: ["manage_matches"] },
    });
    assertEquals(createdRole.status, 200, JSON.stringify(createdRole.body));

    let userId: string | undefined;
    try {
      // RBAC-9: staff accounts are created, not promoted from a customer.
      const created = await invoke<{ user: { id: string } }>(env, "admin-users", {
        token: admin,
        method: "POST",
        body: { email, password: "assign-pass-123", role: "gatekeeper" },
      });
      assertEquals(created.status, 200, JSON.stringify(created.body));
      userId = created.body.data?.user.id;
      assertExists(userId);

      // Reassigning an existing staff member still writes both projections.
      const assigned = await invoke<{ role: string }>(env, "admin-users", {
        token: admin,
        method: "PATCH",
        body: { id: userId, role: code },
      });
      assertEquals(assigned.status, 200, JSON.stringify(assigned.body));

      const membership = await rest<Array<{ staff_role: string }>>(
        env,
        `staff_members?id=eq.${userId}&select=staff_role`,
        { token: env.service },
      );
      assertEquals(membership[0]?.staff_role, code);

      const authUser = await authAdmin<{
        user?: { app_metadata?: { role?: string; capabilities?: string[] } };
        app_metadata?: { role?: string; capabilities?: string[] };
      }>(env, `users/${userId}`);
      const metadata = authUser.body.user?.app_metadata ?? authUser.body.app_metadata;
      assertEquals(metadata?.role, code);
      assertEquals(metadata?.capabilities, ["manage_matches"]);

      const removed = await invoke(env, "admin-users", {
        token: admin,
        method: "PATCH",
        body: { id: userId, role: "customer" },
      });
      assertEquals(removed.status, 200);
      const after = await rest<Array<{ id: string }>>(
        env,
        `staff_members?id=eq.${userId}&select=id`,
        { token: env.service },
      );
      assert(after.length === 0, "Customer removes the membership");
    } finally {
      if (userId) await authAdmin(env, `users/${userId}`, { method: "DELETE" });
      await rest(env, `staff_roles?code=eq.${code}`, {
        token: env.service,
        method: "DELETE",
      });
    }
  },
});
