import { z } from "zod";

import { requireUser } from "../_shared/auth.ts";
import { getEnv } from "../_shared/config.ts";
import { AppError } from "../_shared/errors.ts";
import { ok, serveJson } from "../_shared/http.ts";
import { enforceRateLimit } from "../_shared/rate-limit.ts";
import { serviceClient } from "../_shared/supabase.ts";
import { createCheckoutSession } from "../_shared/stripe.ts";
import { validateBody } from "../_shared/validate.ts";

const bodySchema = z.object({ holdId: z.string().min(1).max(64) });

interface OrderRow {
  id: string;
  user_id: string;
  match_id: string;
  amount_satang: number;
  status: string;
}

interface OrderSeatRow {
  zone_name: string;
  row_label: string;
  number: number;
  price_satang: number;
}

async function handler(request: Request): Promise<Response> {
  const context = await requireUser(request);
  await enforceRateLimit(request, "checkout", { maxHits: 10 });
  const { holdId } = await validateBody(request, bodySchema);
  const db = serviceClient();
  const env = getEnv();

  // Amount and seat snapshot come from the database, never the client.
  const { data: orderData, error: orderError } = await context.client.rpc(
    "create_order_from_hold",
    { p_hold_id: holdId },
  );
  if (orderError) throw orderError;

  const created = orderData as unknown as { id: string };
  const { data: order, error: fetchError } = await db
    .from("orders")
    .select("id,user_id,match_id,amount_satang,status")
    .eq("id", created.id)
    .single<OrderRow>();
  if (fetchError || !order) throw fetchError ?? new AppError("not_found", "Order not found");

  const { data: seats, error: seatError } = await db
    .from("order_seats")
    .select("zone_name,row_label,number,price_satang")
    .eq("order_id", order.id);
  if (seatError) throw seatError;

  const { data: match, error: matchError } = await db
    .from("matches")
    .select("opponent,kickoff_at,venue")
    .eq("id", order.match_id)
    .single<{ opponent: string; kickoff_at: string; venue: string }>();
  if (matchError || !match) throw matchError ?? new AppError("not_found", "Match not found");

  const seatRows = (seats ?? []) as OrderSeatRow[];
  const total = seatRows.reduce((sum, seat) => sum + seat.price_satang, 0);
  if (total !== order.amount_satang) {
    throw new AppError("conflict", "Order total does not match its seat snapshot");
  }

  try {
    const sessionExpiresAt = Math.floor(Date.now() / 1000) + 30 * 60;
    const session = await createCheckoutSession({
      mode: "payment",
      // F-9: card-only MVP. Without this, Stripe enables every method switched
      // on in the dashboard (PromptPay appeared during the Phase 10 demo).
      allowed_payment_method_types: ["card"],
      customer_email: context.user.email ?? undefined,
      currency: "thb",
      line_items: seatRows.map((seat) => ({
        quantity: 1,
        price_data: {
          currency: "thb",
          unit_amount: seat.price_satang,
          product_data: {
            name: `${seat.zone_name} · ${seat.row_label}${seat.number}`,
            description: `KickOff vs ${match.opponent} · ${new Date(match.kickoff_at).toISOString()}`,
          },
        },
      })),
      metadata: { order_id: order.id, user_id: order.user_id },
      payment_intent_data: {
        metadata: { order_id: order.id, user_id: order.user_id },
      },
      success_url: `${env.MOBILE_DEEP_LINK}orders?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${env.MOBILE_DEEP_LINK}orders?checkout=cancelled&order_id=${order.id}`,
      expires_at: sessionExpiresAt,
    });

    const { error: updateError } = await db
      .from("orders")
      .update({
        stripe_session_id: session.id,
        payment_ref: session.id,
        checkout_url: session.url ?? null,
        expires_at: new Date(sessionExpiresAt * 1000).toISOString(),
      })
      .eq("id", order.id);
    if (updateError) throw updateError;

    return ok({ url: session.url, orderId: order.id, sessionId: session.id }, request);
  } catch (error) {
    // Don't leave a pending order blocking seats if Stripe rejects the session.
    try {
      await db.rpc("cancel_order_internal", { p_order_id: order.id });
    } catch {
      // best-effort cleanup
    }
    throw error;
  }
}

Deno.serve(serveJson(handler, ["POST"]));
