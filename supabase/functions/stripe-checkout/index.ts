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
  amount_minor_units: number;
  currency: string;
  status: string;
  tenant_id: string;
}

/** The club that sells this ticket — its account and its fee. */
interface ClubRow {
  stripe_account_id: string | null;
  application_fee_bps: number;
  status: string;
}

interface OrderSeatRow {
  zone_name: string;
  row_label: string;
  number: number;
  price_minor_units: number;
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
    .select("id,user_id,match_id,amount_minor_units,currency,status,tenant_id")
    .eq("id", created.id)
    .single<OrderRow>();
  if (fetchError || !order) throw fetchError ?? new AppError("not_found", "Order not found");

  const { data: seats, error: seatError } = await db
    .from("order_seats")
    .select("zone_name,row_label,number,price_minor_units")
    .eq("order_id", order.id);
  if (seatError) throw seatError;

  const { data: match, error: matchError } = await db
    .from("matches")
    .select("opponent,kickoff_at")
    .eq("id", order.match_id)
    .single<{ opponent: string; kickoff_at: string }>();
  if (matchError || !match) throw matchError ?? new AppError("not_found", "Match not found");

  // Sales stop at the whistle. The stored status can lag behind the clock, so
  // the kickoff timestamp — the same truth the app displays — decides here.
  if (new Date(match.kickoff_at).getTime() <= Date.now()) {
    throw new AppError("match_started", "This match has already kicked off");
  }

  const seatRows = (seats ?? []) as OrderSeatRow[];
  const total = seatRows.reduce((sum, seat) => sum + seat.price_minor_units, 0);
  if (total !== order.amount_minor_units) {
    throw new AppError("conflict", "Order total does not match its seat snapshot");
  }
  // The order snapshotted its currency at sale time; Stripe takes it lowercase.
  const currency = order.currency.toLowerCase();

  // The club is the merchant of record (ADR-003): its connected account takes
  // the charge, and the platform keeps its fee from the same charge. A club
  // without an account is not onboarded yet — it sells on the platform account
  // with no platform fee, exactly as it did before Connect.
  const { data: club, error: clubError } = await db
    .from("tenants")
    .select("stripe_account_id,application_fee_bps,status")
    .eq("id", order.tenant_id)
    .single<ClubRow>();
  if (clubError || !club) throw clubError ?? new AppError("not_found", "Club not found");

  // The fee is the database's rule — the function only carries it.
  const { data: feeData, error: feeError } = await db.rpc("application_fee_minor_units", {
    p_amount_minor_units: order.amount_minor_units,
    p_fee_bps: club.application_fee_bps,
  });
  if (feeError) throw feeError;
  const applicationFee = club.stripe_account_id && typeof feeData === "number" ? feeData : 0;

  try {
    const sessionExpiresAt = Math.floor(Date.now() / 1000) + 30 * 60;
    const session = await createCheckoutSession(
      {
        mode: "payment",
        // F-9: card-only MVP. Without this, Stripe enables every method switched
        // on in the dashboard (PromptPay appeared during the Phase 10 demo).
        allowed_payment_method_types: ["card"],
        customer_email: context.user.email ?? undefined,
        currency,
        line_items: seatRows.map((seat) => ({
          quantity: 1,
          price_data: {
            currency,
            unit_amount: seat.price_minor_units,
            product_data: {
              name: `${seat.zone_name} · ${seat.row_label}${seat.number}`,
              description: `KickOff vs ${match.opponent} · ${new Date(match.kickoff_at).toISOString()}`,
            },
          },
        })),
        metadata: { order_id: order.id, user_id: order.user_id, tenant_id: order.tenant_id },
        payment_intent_data: {
          // A direct charge pays the platform's fee from the same charge; the
          // connected account keeps the rest.
          application_fee_amount: applicationFee,
          metadata: { order_id: order.id, user_id: order.user_id, tenant_id: order.tenant_id },
        },
        success_url: `${env.MOBILE_DEEP_LINK}orders?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${env.MOBILE_DEEP_LINK}orders?checkout=cancelled&order_id=${order.id}`,
        expires_at: sessionExpiresAt,
      },
      { stripeAccount: club.stripe_account_id ?? undefined },
    );

    const { error: updateError } = await db
      .from("orders")
      .update({
        stripe_session_id: session.id,
        payment_ref: session.id,
        checkout_url: session.url ?? null,
        expires_at: new Date(sessionExpiresAt * 1000).toISOString(),
        // The fee is snapshotted: the club's rate may change later, and a
        // refund must never re-derive what was charged.
        application_fee_amount: applicationFee,
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
