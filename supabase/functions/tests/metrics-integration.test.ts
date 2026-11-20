import { assertEquals, assertExists, assert } from "@std/assert";

import { RUN, cleanup, issueTicket, login, requireEnv } from "./_commerce.ts";

Deno.test({
  name: "metrics: revenue, pass and scan counters come from the live tables",
  ignore: !RUN,
  fn: async () => {
    const env = requireEnv();
    const fan = await login(env, env.email, env.password);
    const ticket = await issueTicket(env, fan, "m-bkk-north-A12");
    const token = Deno.env.get("METRICS_TOKEN");
    assertExists(token);

    try {
      const response = await fetch(`${env.url}/functions/v1/metrics`, {
        headers: { "x-metrics-token": token },
      });
      assertEquals(response.status, 200);
      const body = (await response.json()) as {
        data?: {
          orders?: { total: number; paid: number; refunded: number };
          scans?: { total: number; valid: number };
          availability?: { target: number };
        };
      };
      const data = body.data;
      assertExists(data?.orders);
      assert(data.orders.total >= 1, "the paid order is in the total");
      assert(data.orders.paid >= 1, "the paid order is counted");
      assert(typeof data.orders.refunded === "number");
      assertExists(data.scans);
      assert(typeof data.scans.total === "number");
      assert(typeof data.scans.valid === "number");
      assertEquals(data.availability?.target, 99.5);
    } finally {
      await cleanup(env, { orderId: ticket.orderId, eventId: ticket.eventId });
    }
  },
});
