import type Stripe from "stripe";

import { writeAudit } from "../_shared/audit.ts";
import { AppError } from "../_shared/errors.ts";
import { ok, serveJson } from "../_shared/http.ts";
import { logger } from "../_shared/logger.ts";
import { serviceClient } from "../_shared/supabase.ts";
import { constructWebhookEvent, createRefund } from "../_shared/stripe.ts";

const MAX_BODY_BYTES = 256 * 1024;

interface MinimalOrder {
  id: string;
  status: string;
  payment_intent_id: string | null;
}

async function markPaid(orderId: string, session: Stripe.Checkout.Session): Promise<void> {
  const db = serviceClient();
  const paymentIntent =
    typeof session.payment_intent === "string"
      ? session.payment_intent
      : session.payment_intent?.id ?? null;

  const { error } = await db.rpc("mark_order_paid", {
    p_order_id: orderId,
    p_session_id: session.id,
    p_payment_intent_id: paymentIntent,
  });
  if (!error) return;

  // The order was cancelled/expired before payment landed: refund automatically.
  if (error.code === "P0001") {
    if (paymentIntent) {
      await createRefund({
        payment_intent: paymentIntent,
        reason: "requested_by_customer",
        metadata: { order_id: orderId, reason: "late_webhook" },
      });
      await writeAudit({
        action: "stripe.late_payment_refund",
        entity: "orders",
        entityId: orderId,
        metadata: { payment_intent: paymentIntent },
      });
      logger.warn("webhook.late_payment_refunded", { orderId });
    } else {
      logger.error("webhook.late_payment_without_intent", { orderId });
    }
    return;
  }
  throw error;
}

async function handleEvent(event: Stripe.Event): Promise<void> {
  const db = serviceClient();

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const orderId = session.metadata?.order_id;
    if (!orderId) throw new AppError("validation", "Session is missing order metadata");
    await markPaid(orderId, session);
    return;
  }

  if (event.type === "checkout.session.expired") {
    const session = event.data.object as Stripe.Checkout.Session;
    const orderId = session.metadata?.order_id;
    if (!orderId) return;
    const { error } = await db
      .from("orders")
      .update({ status: "cancelled" })
      .eq("id", orderId)
      .eq("status", "pending");
    if (error) throw error;
    return;
  }

  if (event.type === "charge.refunded") {
    const charge = event.data.object as Stripe.Charge;
    const paymentIntent =
      typeof charge.payment_intent === "string"
        ? charge.payment_intent
        : charge.payment_intent?.id ?? null;
    if (!paymentIntent) return;

    const { data: order, error } = await db
      .from("orders")
      .select("id,status,payment_intent_id")
      .eq("payment_intent_id", paymentIntent)
      .maybeSingle<MinimalOrder>();
    if (error) throw error;
    if (!order) return;

    const { error: orderError } = await db
      .from("orders")
      .update({ status: "refunded" })
      .eq("id", order.id);
    if (orderError) throw orderError;

    const { error: ticketError } = await db
      .from("tickets")
      .update({ status: "void" })
      .eq("order_id", order.id);
    if (ticketError) throw ticketError;

    await writeAudit({
      action: "stripe.charge_refunded",
      entity: "orders",
      entityId: order.id,
      metadata: { payment_intent: paymentIntent, charge_id: charge.id },
    });
  }
}

async function handler(request: Request): Promise<Response> {
  const signature = request.headers.get("stripe-signature");
  if (!signature) throw new AppError("unauthorized", "Missing stripe-signature header");

  const rawBody = await request.text();
  if (rawBody.length === 0) throw new AppError("validation", "Empty webhook body");
  if (rawBody.length > MAX_BODY_BYTES) {
    throw new AppError("validation", "Webhook body too large", { status: 413 });
  }

  // Signature verification MUST happen before any parsing or database access.
  const event = await constructWebhookEvent(rawBody, signature);
  const db = serviceClient();

  const { data: inserted, error: insertError } = await db
    .from("stripe_events")
    .upsert(
      { id: event.id, type: event.type },
      { onConflict: "id", ignoreDuplicates: true },
    )
    .select("id");
  if (insertError) throw insertError;

  if (!inserted || inserted.length === 0) {
    return ok({ received: true, replayed: true }, request);
  }

  try {
    await handleEvent(event);
  } catch (error) {
    // Remove the idempotency marker so Stripe's retry can process the event.
    await db.from("stripe_events").delete().eq("id", event.id);
    throw error;
  }

  return ok({ received: true, replayed: false }, request);
}

Deno.serve(serveJson(handler, ["POST"]));
