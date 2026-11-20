import { assertEquals, assertExists } from "@std/assert";

import { RUN, login, requireEnv, rest } from "./_commerce.ts";


Deno.test({
  name: "settings: an admin round-trips a club setting; a fan cannot write it",
  ignore: !RUN,
  fn: async () => {
    const env = requireEnv();
    const admin = await login(env, Deno.env.get("ADMIN_EMAIL") ?? "admin@kickoff.app",
      Deno.env.get("ADMIN_PASSWORD") ?? "kickoffadmin");
    const fan = await login(env, env.email, env.password);

    const [before] = await rest<Array<{ value: unknown }>>(
      env,
      "app_settings?key=eq.club_name&select=value",
      { token: env.service },
    );
    assertExists(before);

    try {
      await rest(env, "app_settings?key=eq.club_name", {
        token: admin,
        method: "PATCH",
        body: { value: "Settings Roundtrip" },
        prefer: "return=minimal",
      });

      const [after] = await rest<Array<{ value: string }>>(
        env,
        "app_settings?key=eq.club_name&select=value",
        { token: env.service },
      );
      assertEquals(after?.value, "Settings Roundtrip");

      await rest(env, "app_settings?key=eq.club_name", {
        token: fan,
        method: "PATCH",
        body: { value: "Fan Edit" },
        prefer: "return=minimal",
      });
      const [unchanged] = await rest<Array<{ value: string }>>(
        env,
        "app_settings?key=eq.club_name&select=value",
        { token: env.service },
      );
      assertEquals(unchanged?.value, "Settings Roundtrip", "a fan's write is a zero-row no-op");
    } finally {
      await rest(env, "app_settings?key=eq.club_name", {
        token: env.service,
        method: "PATCH",
        body: { value: before.value },
        prefer: "return=minimal",
      });
    }
  },
});
