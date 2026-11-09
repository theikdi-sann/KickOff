import { z } from "zod";

import { writeAudit } from "../_shared/audit.ts";
import { requireAdmin } from "../_shared/auth.ts";
import { AppError } from "../_shared/errors.ts";
import { ok, serveJson } from "../_shared/http.ts";
import { serviceClient } from "../_shared/supabase.ts";
import { createRefund } from "../_shared/stripe.ts";
import { validateBody } from "../_shared/validate.ts";

const bodySchema = z.object({
  orderId: z.string().min(1).max(64),
  reason: z.string().max(400).optional(),
  overrideUsedTickets: z.boolean().default(false),
});

interface OrderRow {
  id: string;
  status: string;
  payment_intent_id: string | null;
  amount_satang: number;
  user_id: string;
}

async function handler(request: Request): Promise<Response> {
  const context = await requireAdmin(request);
  const body = await validateBody(request, bodySchema);
  const db = serviceClient();

  const { data: order, error: orderError } = await db
    .from("orders")
    .select("id,status,payment_intent_id,amount_satang,user_id")
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

  const refund = await createRefund({
    payment_intent: order.payment_intent_id,
    reason: "requested_by_customer",
    metadata: {
      order_id: order.id,
      admin_id: context.user.id,
      reason: body.reason ?? "",
      override_used_tickets: String(body.overrideUsedTickets),
    },
  });

  const { error: updateError } = await db
    .from("orders")
    .update({ status: "refunded" })
    .eq("id", order.id);
  if (updateError) throw updateError;

  const { error: voidError } = await db
    .from("tickets")
    .update({ status: "void" })
    .eq("order_id", order.id);
  if (voidError) throw voidError;

  await writeAudit({
    actorId: context.user.id,
    action: "order.refund",
    entity: "orders",
    entityId: order.id,
    metadata: {
      refund_id: refund.id,
      amount_satang: order.amount_satang,
      reason: body.reason ?? null,
      override_used_tickets: body.overrideUsedTickets,
      used_tickets: usedTickets.length,
    },
  });

  return ok({ refunded: true, refundId: refund.id, alreadyRefunded: false }, request);
}

Deno.serve(serveJson(handler, ["POST"]));
