import { requireAdmin } from "../_shared/auth.ts";
import { AppError } from "../_shared/errors.ts";
import { ok, serveJson } from "../_shared/http.ts";
import { refundOrderSchema } from "../_shared/refund.ts";
import { serviceClient } from "../_shared/supabase.ts";
import { createRefund } from "../_shared/stripe.ts";
import { validateBody } from "../_shared/validate.ts";

interface OrderRow {
  id: string;
  status: string;
  payment_intent_id: string | null;
}

async function handler(request: Request): Promise<Response> {
  const context = await requireAdmin(request);
  const body = await validateBody(request, refundOrderSchema);
  const db = serviceClient();

  const { data: order, error: orderError } = await db
    .from("orders")
    .select("id,status,payment_intent_id")
    .eq("id", body.orderId)
    .maybeSingle<OrderRow>();
  if (orderError || !order) throw orderError ?? new AppError("not_found", "Order not found");

  if (order.status === "refunded") {
    return ok({ refunded: true, alreadyRefunded: true }, request);
  }
  if (order.status !== "paid") {
    throw new AppError("conflict", "Only paid orders can be refunded");
  }

  const { data: tickets, error: ticketError } = await db
    .from("tickets")
    .select("id,status")
    .eq("order_id", order.id);
  if (ticketError) throw ticketError;

  const usedTickets = (tickets ?? []).filter((ticket) => ticket.status === "used");
  if (usedTickets.length > 0 && !body.overrideUsedTickets) {
    throw new AppError(
      "conflict",
      `${usedTickets.length} ticket(s) have already been scanned; an admin override is required`,
    );
  }

  if (!order.payment_intent_id) {
    throw new AppError("conflict", "Order has no Stripe payment intent");
  }

  // The money moves first, with an order-scoped idempotency key: if the
  // database half below fails, the admin's retry returns this same refund
  // from Stripe instead of creating a second one (F-07).
  const refund = await createRefund(
    {
      payment_intent: order.payment_intent_id,
      reason: "requested_by_customer",
      metadata: {
        order_id: order.id,
        admin_id: context.user.id,
        reason: body.reason ?? "",
        override_used_tickets: String(body.overrideUsedTickets),
      },
    },
    { idempotencyKey: `refund_${order.id}` },
  );

  // One call flips the order, voids the tickets, releases the seats and
  // writes the audit row — all in one transaction. A failure here raises,
  // the client is told the truth, and the retry converges.
  const { data: state, error: stateError } = await db.rpc("mark_order_refunded", {
    p_order_id: order.id,
    p_actor_id: context.user.id,
    p_refund_id: refund.id,
    p_reason: body.reason ?? undefined,
    p_override_used_tickets: body.overrideUsedTickets,
  });
  if (stateError || !state) {
    throw new AppError(
      "internal",
      `Refund saved in Stripe but not in the database: ${stateError?.message ?? "no result"}`,
    );
  }

  const alreadyRefunded =
    (state as { alreadyRefunded?: boolean }).alreadyRefunded === true;

  return ok({ refunded: true, refundId: refund.id, alreadyRefunded }, request);
}

Deno.serve(serveJson(handler, ["POST"]));
