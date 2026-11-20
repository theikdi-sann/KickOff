import { assertEquals, assertExists } from "@std/assert";

import {
  RUN,
  cleanup,
  issueTicket,
  login,
  requireEnv,
  rest,
  invoke,
} from "./_commerce.ts";

type Env = ReturnType<typeof requireEnv>;

async function adminToken(env: Env): Promise<string> {
  const email = Deno.env.get("ADMIN_EMAIL") ?? "admin@kickoff.app";
  const password = Deno.env.get("ADMIN_PASSWORD") ?? "kickoffadmin";
  return login(env, email, password);
}

async function refund(
  env: Env,
  token: string,
  orderId: string,
): Promise<{ status: number; body: { ok: boolean; data?: { refunded: boolean; alreadyRefunded: boolean; refundId?: string }; error?: { message: string } } }> {
  return invoke(env, "refund-order", { token, body: { orderId } });
}

Deno.test({
  name: "refund: paid order → ledger + void ticket + audit, idempotently",
  ignore: !RUN,
  fn: async () => {
    const env = requireEnv();
    const admin = await adminToken(env);
    const fan = await login(env, env.email, env.password);
    const ticket = await issueTicket(env, fan, "m-bkk-north-A9");

    try {
      const first = await refund(env, admin, ticket.orderId);
      assertEquals(first.status, 200);
      assertEquals(first.body.data?.refunded, true);
      assertEquals(first.body.data?.alreadyRefunded, false);
      assertExists(first.body.data?.refundId);

      const [order] = await rest<Array<{ status: string }>>(
        env,
        `orders?id=eq.${ticket.orderId}&select=status`,
        { token: env.service },
      );
      assertEquals(order?.status, "refunded");

      const [row] = await rest<Array<{ status: string }>>(
        env,
        `tickets?id=eq.${ticket.ticketId}&select=status`,
        { token: env.service },
      );
      assertEquals(row?.status, "void");

      const refunds = await rest<Array<{ id: string; amount_minor_units: number }>>(
        env,
        `refunds?order_id=eq.${ticket.orderId}&select=id,amount_minor_units`,
        { token: env.service },
      );
      assertEquals(refunds.length, 1);
      assertEquals(refunds[0]?.id, first.body.data?.refundId);

      const audit = await rest<Array<{ action: string }>>(
        env,
        `audit_logs?entity_id=eq.${ticket.orderId}&action=eq.order.refund&select=action`,
        { token: env.service },
      );
      assertEquals(audit.length, 1);

      // The Stripe call is idempotent by order key and the database returns the
      // same ledger result — a retry must not refund twice.
      const second = await refund(env, admin, ticket.orderId);
      assertEquals(second.status, 200);
      assertEquals(second.body.data?.alreadyRefunded, true);
    } finally {
      await rest(env, `refunds?order_id=eq.${ticket.orderId}`, {
        token: env.service,
        method: "DELETE",
      });
      await rest(env, `audit_logs?entity_id=eq.${ticket.orderId}`, {
        token: env.service,
        method: "DELETE",
      });
      await cleanup(env, { orderId: ticket.orderId, eventId: ticket.eventId });
    }
  },
});

Deno.test({
  name: "refund: a fan cannot refund, and only paid orders are refundable",
  ignore: !RUN,
  fn: async () => {
    const env = requireEnv();
    const fan = await login(env, env.email, env.password);

    const forbidden = await refund(env, fan, "ord_does_not_matter");
    assertEquals(forbidden.status, 403);

    const admin = await adminToken(env);
    const missing = await refund(env, admin, "ord_missing");
    assertEquals(missing.status, 404);
  },
});
