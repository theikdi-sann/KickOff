import { assertEquals, assertExists } from "@std/assert";

import { RUN, login, requireEnv, rest } from "./_commerce.ts";

type Env = ReturnType<typeof requireEnv>;

async function adminToken(env: Env): Promise<string> {
  const email = Deno.env.get("ADMIN_EMAIL") ?? "admin@kickoff.app";
  const password = Deno.env.get("ADMIN_PASSWORD") ?? "kickoffadmin";
  return login(env, email, password);
}

async function raw(
  env: Env,
  path: string,
  input: { token: string; method: string; body?: unknown },
): Promise<{ status: number; text: string }> {
  const response = await fetch(`${env.url}/rest/v1/${path}`, {
    method: input.method,
    headers: {
      apikey: env.anon,
      authorization: `Bearer ${input.token}`,
      ...(input.body ? { "content-type": "application/json" } : {}),
    },
    body: input.body ? JSON.stringify(input.body) : undefined,
  });
  return { status: response.status, text: await response.text() };
}

Deno.test({
  name: "news admin: publish, edit and unpublish; anon reads only what is live",
  ignore: !RUN,
  fn: async () => {
    const env = requireEnv();
    const admin = await adminToken(env);
    const fan = await login(env, env.email, env.password);
    const title = `Wave One article ${crypto.randomUUID().slice(0, 6)}`;

    const created = await rest<Array<{ id: string; title: string }>>(env, "news_items", {
      token: admin,
      method: "POST",
      body: {
        title,
        excerpt: "Created by the local acceptance suite.",
        body: "Full article body.",
        category: "Club News",
        published_at: new Date().toISOString(),
        read_minutes: 2,
        image_colors: ["#0B6B3A", "#052E1A"],
      },
      prefer: "return=representation",
    });
    const articleId = created[0]?.id;
    assertExists(articleId);

    try {
      const live = await rest<Array<{ title: string }>>(
        env,
        `news_items?id=eq.${articleId}&select=title`,
      );
      assertEquals(live[0]?.title, title, "anonymous supporters read the published article");

      const edited = await rest<Array<{ title: string }>>(env, `news_items?id=eq.${articleId}`, {
        token: admin,
        method: "PATCH",
        body: { title: `${title} (edited)`, read_minutes: 3 },
        prefer: "return=representation",
      });
      assertEquals(edited[0]?.title, `${title} (edited)`);

      // RLS makes the fan's UPDATE a zero-row no-op (PostgREST returns 204),
      // so prove the row did not change rather than trusting the status code.
      const asFan = await raw(env, `news_items?id=eq.${articleId}`, {
        token: fan,
        method: "PATCH",
        body: { title: "fan edit" },
      });
      const [unchanged] = await rest<Array<{ title: string }>>(
        env,
        `news_items?id=eq.${articleId}&select=title`,
        { token: env.service },
      );
      assertEquals(unchanged?.title, `${title} (edited)`, `fan edit was blocked (${asFan.status})`);

      const fanDelete = await raw(env, `news_items?id=eq.${articleId}`, {
        token: fan,
        method: "DELETE",
      });
      const [stillThere] = await rest<Array<{ id: string }>>(
        env,
        `news_items?id=eq.${articleId}&select=id`,
        { token: env.service },
      );
      assertEquals(stillThere?.id, articleId, `fan delete was blocked (${fanDelete.status})`);

      const removed = await raw(env, `news_items?id=eq.${articleId}`, {
        token: admin,
        method: "DELETE",
      });
      assertEquals(removed.status, 204, removed.text);

      const after = await rest<Array<{ id: string }>>(
        env,
        `news_items?id=eq.${articleId}&select=id`,
      );
      assertEquals(after, [], "an unpublished article disappears from the public feed");
    } finally {
      await rest(env, `news_items?id=eq.${articleId}`, {
        token: env.service,
        method: "DELETE",
      });
    }
  },
});
