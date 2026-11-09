import { assertEquals } from "@std/assert";

import {
  RUN,
  cleanup,
  createPaidOrder,
  login,
  requireEnv,
  rest,
  sendCheckoutCompleted,
  signStripePayload,
} from "./_commerce.ts";

const SEAT = "m-bkk-north-A2";

Deno.test({
  name: "webhook replay is a no-op (single fulfilment)",
  ignore: !RUN,
  fn: async () => {
    const env = requireEnv();
    const fan = await login(env, env.email, env.password);
    const order = await createPaidOrder(env, fan, SEAT);

    try {
      const first = await sendCheckoutCompleted(env, order);
      assertEquals(first.status, 200);
      assertEquals(first.body.data?.replayed, false);

      const replay = await sendCheckoutCompleted(env, order);
      assertEquals(replay.status, 200);
      assertEquals(replay.body.data?.replayed, true);

      const tickets = await rest<Array<{ id: string }>>(
        env,
        `tickets?order_id=eq.${order.orderId}&select=id`,
        { token: env.service },
      );
      assertEquals(tickets.length, 1, "replay must not issue another ticket");

      // Unsigned/tampered payloads are rejected before touching the database.
      const payload = JSON.stringify({ id: `evt_bad_${crypto.randomUUID()}`, type: "checkout.session.completed", data: { object: {} } });
      const badSignature = await signStripePayload(payload, `${env.webhookSecret}-wrong`);
      const rejected = await fetch(`${env.url}/functions/v1/stripe-webhook`, {
        method: "POST",
        headers: { apikey: env.anon, "content-type": "application/json", "stripe-signature": badSignature },
        body: payload,
      });
      assertEquals(rejected.status, 400);
    } finally {
      await cleanup(env, { ...order, seatId: SEAT });
    }
  },
});
