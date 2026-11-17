import { assertEquals } from "@std/assert";

import { invoke, login, requireEnv, rest, RUN } from "./_commerce.ts";

interface ExportDocument {
  generatedAt: string;
  subject: string;
  counts: Record<string, number>;
  data: {
    profiles: Array<{ id: string; email: string }>;
    orders: unknown[];
    tickets: unknown[];
  };
}

Deno.test({
  name: "export-user returns the subject's own data across clubs",
  ignore: !RUN,
  fn: async () => {
    const env = requireEnv();
    const token = await login(env, env.email, env.password);

    const profile = await rest<Array<{ id: string }>>(
      env,
      `profiles?email=eq.${env.email}&select=id`,
      { token },
    );
    assertEquals(profile.length, 1, "the demo fan must exist");
    const subjectId = profile[0]?.id;
    if (!subjectId) throw new Error("the demo fan profile was not returned");

    const response = await invoke<{ export: ExportDocument }>(env, "export-user", { token });
    assertEquals(response.status, 200);

    const doc = response.body.data?.export;
    if (!doc) throw new Error("the export document was not returned");
    assertEquals(doc.subject, subjectId, "the export belongs to the signed-in fan");
    const profileRow = doc.data.profiles[0];
    if (!profileRow) throw new Error("the export must include the profile row");
    assertEquals(
      profileRow.email,
      env.email,
      "the profile row is the subject's own",
    );
    for (const table of ["orders", "order_seats", "tickets", "seat_holds", "device_tokens"]) {
      assertEquals(
        Array.isArray(doc.counts[table]),
        false,
        `${table}'s count is a number, not an array`,
      );
      const rows = doc.data[table as "orders"];
      assertEquals(
        Array.isArray(rows) ? rows.length : 0,
        doc.counts[table],
        `${table}'s row count matches its summary`,
      );
    }
  },
});

Deno.test({
  name: "export-user refuses another person's export unless the caller is an admin",
  ignore: !RUN,
  fn: async () => {
    const env = requireEnv();
    const token = await login(env, env.email, env.password);

    const response = await invoke(env, "export-user", {
      token,
      body: { userId: crypto.randomUUID() },
    });
    assertEquals(response.status, 403);
    assertEquals(
      response.body.error?.message,
      "You can only export your own account",
    );
  },
});
