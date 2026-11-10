import { assertEquals } from "@std/assert";

import {
  RUN,
  cleanup,
  createPaidOrder,
  invoke,
  login,
  requireEnv,
  rest,
  sendCheckoutCompleted,
} from "./_commerce.ts";

const SEAT = "m-bkk-north-A1";

Deno.test({
  name: "order → webhook → tickets → receipt",
  ignore: !RUN,
  fn: async () => {
    const env = requireEnv();
    const fan = await login(env, env.email, env.password);
    const order = await createPaidOrder(env, fan, SEAT);

    try {
      const webhook = await sendCheckoutCompleted(env, order);
      assertEquals(webhook.status, 200);

      const tickets = await rest<Array<{ id: string; status: string }>>(
        env,
        `tickets?order_id=eq.${order.orderId}&select=id,status`,
        { token: env.service },
      );
      assertEquals(tickets.length, 1);
      assertEquals(tickets[0]!.status, "valid");

      const qr = await invoke<{ qrPayload: string; version: number }>(env, "ticket-qr", {
        token: fan,
        body: { ticketId: tickets[0]!.id },
      });
      assertEquals(qr.status, 200);
      assertEquals(qr.body.data?.version, 2);
      assertEquals(qr.body.data?.qrPayload.startsWith("KICKOFF-V2:"), true);

      const receipt = await invoke<{ url: string }>(env, "receipt", {
        token: fan,
        body: { orderId: order.orderId },
      });
      assertEquals(receipt.status, 200);

      const pdf = await fetch(receipt.body.data!.url);
      assertEquals(pdf.status, 200);
      const bytes = new Uint8Array(await pdf.arrayBuffer());
      assertEquals(new TextDecoder().decode(bytes.slice(0, 5)), "%PDF-");
    } finally {
      await cleanup(env, { ...order, seatId: SEAT });
    }
  },
});
