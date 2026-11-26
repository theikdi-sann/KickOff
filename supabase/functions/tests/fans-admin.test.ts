import { assertEquals, assert } from "@std/assert";

import { RUN, authAdmin, invoke, login, requireEnv } from "./_commerce.ts";

/**
 * REQ-26 / FAN-1 — the Users screen's fan lifecycle is backed by the auth
 * account, not just a badge: suspension blocks sign-in and can be restored;
 * soft deletion blocks sign-in and keeps the profile/audit row.
 */
Deno.test({
  name: "FAN-1 a fan can be suspended, restored and soft-deleted",
  ignore: !RUN,
  fn: async () => {
    const env = requireEnv();
    const created = await authAdmin<{
      user?: { id: string; email?: string };
      id?: string;
      email?: string;
    }>(env, "users", {
      method: "POST",
      body: {
        email: `fan-status-${crypto.randomUUID().slice(0, 8)}@kickoff.test`,
        password: "fan-status-pass-123",
        email_confirm: true,
        app_metadata: { role: "customer" },
      },
    });
    const fanId = created.body.user?.id ?? created.body.id;
    const email = created.body.user?.email ?? created.body.email;
    assert(fanId && email, "the fan fixture must have an id and email");
    const password = "fan-status-pass-123";

    const adminToken = await login(
      env,
      Deno.env.get("ADMIN_EMAIL") ?? "admin@kickoff.app",
      Deno.env.get("ADMIN_PASSWORD") ?? "kickoffadmin",
    );

    try {
      assert((await login(env, email, password)).length > 0, "the fan starts able to sign in");

      const suspended = await invoke(env, "admin-users", {
        token: adminToken,
        method: "PATCH",
        body: { id: fanId, fanStatus: "suspended" },
      });
      assertEquals(suspended.status, 200, JSON.stringify(suspended.body));

      let signInFailed = false;
      try {
        await login(env, email, password);
      } catch {
        signInFailed = true;
      }
      assert(signInFailed, "a suspended fan cannot sign in");

      const restored = await invoke(env, "admin-users", {
        token: adminToken,
        method: "PATCH",
        body: { id: fanId, fanStatus: "active" },
      });
      assertEquals(restored.status, 200, JSON.stringify(restored.body));
      assert((await login(env, email, password)).length > 0, "restoring lets the fan sign in");

      const deleted = await invoke(env, "admin-users", {
        token: adminToken,
        method: "PATCH",
        body: { id: fanId, fanStatus: "deleted" },
      });
      assertEquals(deleted.status, 200, JSON.stringify(deleted.body));

      signInFailed = false;
      try {
        await login(env, email, password);
      } catch {
        signInFailed = true;
      }
      assert(signInFailed, "a soft-deleted fan cannot sign in");

      // The profile/audit row is retained; only the sign-in path is closed.
      const profile = await fetch(
        `${env.url}/rest/v1/profiles?id=eq.${fanId}&select=id`,
        {
          headers: {
            apikey: env.service,
            authorization: `Bearer ${env.service}`,
          },
        },
      ).then((response) => response.json() as Promise<Array<{ id: string }>>);
      assertEquals(profile[0]?.id, fanId, "the profile row is retained");

      const fans = await fetch(
        `${env.url}/rest/v1/fans?id=eq.${fanId}&select=status`,
        {
          headers: {
            apikey: env.service,
            authorization: `Bearer ${env.service}`,
          },
        },
      ).then((response) => response.json() as Promise<Array<{ status: string }>>);
      assertEquals(fans[0]?.status, "deleted");

      const refusedRestore = await invoke(env, "admin-users", {
        token: adminToken,
        method: "PATCH",
        body: { id: fanId, fanStatus: "active" },
      });
      assertEquals(refusedRestore.status, 409, JSON.stringify(refusedRestore.body));
    } finally {
      await authAdmin(env, `users/${fanId}`, { method: "DELETE" });
    }
  },
});
