import { assertEquals, assertExists } from "@std/assert";

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
      const [ticket] = tickets;
      assertExists(ticket);
      assertEquals(ticket.status, "valid");

      const qr = await invoke<{ qrPayload: string; version: number }>(env, "ticket-qr", {
        token: fan,
        body: { ticketId: ticket.id },
      });
      assertEquals(qr.status, 200);
      assertEquals(qr.body.data?.version, 2);
      assertEquals(qr.body.data?.qrPayload.startsWith("KICKOFF-V2:"), true);

      const receipt = await invoke<{ url: string }>(env, "receipt", {
        token: fan,
        body: { orderId: order.orderId },
      });
      assertEquals(receipt.status, 200);

      assertExists(receipt.body.data);
      // Local Storage signs a container-internal URL (`http://kong:8000`);
      // rewrite it to the API the test can reach. Hosted URLs pass through.
      const receiptUrl = receipt.body.data.url.replace("http://kong:8000", env.url);
      const pdf = await fetch(receiptUrl);
      assertEquals(pdf.status, 200);
      const bytes = new Uint8Array(await pdf.arrayBuffer());
      assertEquals(new TextDecoder().decode(bytes.slice(0, 5)), "%PDF-");
    } finally {
      await cleanup(env, { ...order });
    }
  },
});
