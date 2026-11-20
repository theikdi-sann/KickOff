import { assertEquals, assertExists, assert } from "@std/assert";

import { RUN, authAdmin, invoke, login, requireEnv, rest } from "./_commerce.ts";

type Env = ReturnType<typeof requireEnv>;

async function adminToken(env: Env): Promise<string> {
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

    const user = await authAdmin<{ user?: { id: string }; id?: string }>(env, "users", {
      method: "POST",
      body: {
        email,
        password: "assign-pass-123",
        email_confirm: true,
        app_metadata: { role: "customer" },
      },
    });
    const userId = user.body.user?.id ?? user.body.id;
    assertExists(userId);

    try {
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
      await authAdmin(env, `users/${userId}`, { method: "DELETE" });
      await rest(env, `staff_roles?code=eq.${code}`, {
        token: env.service,
        method: "DELETE",
      });
    }
  },
});
