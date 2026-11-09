import Stripe from "stripe";

import { getEnv } from "./config.ts";

let cached: Stripe | null = null;

/** Lazily constructs the Stripe client (test-mode key enforced by config.ts). */
export function stripeClient(): Stripe {
  if (!cached) {
    cached = new Stripe(getEnv().STRIPE_SECRET_KEY, {
      maxNetworkRetries: 2,
      timeout: 20_000,
    });
  }
  return cached;
}

export function createCheckoutSession(
  params: Stripe.Checkout.SessionCreateParams,
): Promise<Stripe.Checkout.Session> {
  return stripeClient().checkout.sessions.create(params);
}

export function retrieveCheckoutSession(
  sessionId: string,
): Promise<Stripe.Checkout.Session> {
  return stripeClient().checkout.sessions.retrieve(sessionId);
}

export function createRefund(params: Stripe.RefundCreateParams): Promise<Stripe.Refund> {
  return stripeClient().refunds.create(params);
}

/** Verifies the `stripe-signature` header and returns the typed event. */
export async function constructWebhookEvent(
  payload: string,
  signature: string,
): Promise<Stripe.Event> {
  const env = getEnv();
  return await stripeClient().webhooks.constructEventAsync(
    payload,
    signature,
    env.STRIPE_WEBHOOK_SECRET,
  );
}
