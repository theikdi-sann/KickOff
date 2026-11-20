import { assertEquals, assertExists, assert } from "@std/assert";

import { AppError } from "../_shared/errors.ts";
import { recordFailure } from "../_shared/observability.ts";
import { RUN, requireEnv, rest } from "./_commerce.ts";


Deno.test({
  name: "availability: a health probe is recorded and the monthly SLO is computed",
  ignore: !RUN,
  fn: async () => {
    const env = requireEnv();
    const started = Date.now();
    const response = await fetch(`${env.url}/functions/v1/health`);
    const latencyMs = Date.now() - started;

    const [probe] = await rest<Array<{ id: number }>>(env, "availability_probes", {
      token: env.service,
      method: "POST",
      body: {
        ok: response.ok,
        status: response.status,
        latency_ms: latencyMs,
        source: "health",
      },
      prefer: "return=representation",
    });
    assertExists(probe?.id);

    try {
      const [row] = await rest<
        Array<{ probes: number; ok_probes: number; availability_pct: number | null }>
      >(
        env,
        "availability_monthly?select=probes,ok_probes,availability_pct&order=month.desc&limit=1",
        { token: env.service },
      );
      assertExists(row);
      assert(row.probes >= 1, "the probe is in the monthly denominator");
      assertEquals(row.ok_probes >= 1, true);
      assert(row.availability_pct !== null && row.availability_pct >= 0, "the SLO is computed");

      const token = Deno.env.get("METRICS_TOKEN");
      assertExists(token);
      const metricsResponse = await fetch(`${env.url}/functions/v1/metrics`, {
        headers: { "x-metrics-token": token },
      });
      assertEquals(metricsResponse.status, 200);
      const metrics = (await metricsResponse.json()) as {
        data?: { availability?: { probes: number; target: number } };
      };
      assert(metrics.data?.availability, "metrics exposes the availability block");
      assert((metrics.data.availability.probes ?? 0) >= 1);
      assertEquals(metrics.data.availability.target, 99.5);
    } finally {
      await rest(env, `availability_probes?id=eq.${probe.id}`, {
        token: env.service,
        method: "DELETE",
      });
    }
  },
});

Deno.test({
  name: "availability: a synthetic 5xx burst pages once, not once per error",
  ignore: !RUN,
  fn: async () => {
    const env = requireEnv();
    const marker = `burst-${crypto.randomUUID()}`;
    const calls: string[] = [];
    const originalFetch = globalThis.fetch;

    // `getEnv` reads these at call time; `_commerce` does not need them.
    Deno.env.set("STRIPE_SECRET_KEY", "sk_test_alert_probe");
    Deno.env.set("STRIPE_WEBHOOK_SECRET", "whsec_alert_probe");
    Deno.env.set("TICKET_HMAC_KEY", "0123456789abcdef0123456789abcdef");
    Deno.env.set("METRICS_TOKEN", "alert-probe-metrics-token");
    Deno.env.set("ADMIN_APP_URL", "http://localhost:3000");
    Deno.env.set("MOBILE_DEEP_LINK", "kickoff://");
    Deno.env.set("ALERT_WEBHOOK_URL", "https://alert.test/hook");

    globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
      const href =
        typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (href.startsWith("https://alert.test/")) {
        calls.push(String(init?.body ?? ""));
        return Promise.resolve(new Response("ok", { status: 200 }));
      }
      return originalFetch(input as RequestInfo, init);
    }) as typeof fetch;

    try {
      for (let index = 0; index < 6; index += 1) {
        await recordFailure(
          new AppError("internal", "synthetic availability burst"),
          new Request(`${env.url}/functions/v1/health`),
          `${marker}-${index}`,
        );
      }
    } finally {
      globalThis.fetch = originalFetch;
    }

    try {
      assertEquals(calls.length, 1, "six 5xx failures in one window must page once");
      assert(calls[0]?.includes("health"), "the page names the failing surface");

      const rows = await rest<Array<{ id: string }>>(
        env,
        `error_events?request_id=like.${marker}*&select=id`,
        { token: env.service },
      );
      assertEquals(rows.length, 6, "every failure stays durable");
    } finally {
      await rest(env, `error_events?request_id=like.${marker}*`, {
        token: env.service,
        method: "DELETE",
      });
    }
  },
});
