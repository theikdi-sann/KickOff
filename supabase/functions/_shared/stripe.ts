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

/**
 * The connected account a Connect call acts on (ADR-003).
 *
 * The platform secret stays the only payment secret; the connected account
 * is named per call, so the club is the merchant of record and its funds
 * settle in its own Stripe account.
 */
export interface StripeAccountOptions {
  /** The club's connected account. Omitted for a club not onboarded yet. */
  stripeAccount?: string;
}

function requestOptions(options?: StripeAccountOptions): Stripe.RequestOptions | undefined {
  return options?.stripeAccount ? { stripeAccount: options.stripeAccount } : undefined;
}

export function createCheckoutSession(
  params: Stripe.Checkout.SessionCreateParams,
  options?: StripeAccountOptions,
): Promise<Stripe.Checkout.Session> {
  return stripeClient().checkout.sessions.create(params, requestOptions(options));
}

export function retrieveCheckoutSession(
  sessionId: string,
  options?: StripeAccountOptions,
): Promise<Stripe.Checkout.Session> {
  // The Stripe SDK takes the resource params before the request options.
  return stripeClient().checkout.sessions.retrieve(sessionId, undefined, requestOptions(options));
}

export function createRefund(
  params: Stripe.RefundCreateParams,
  options?: { idempotencyKey?: string } & StripeAccountOptions,
): Promise<Stripe.Refund> {
  const request: Stripe.RequestOptions = { ...requestOptions(options) };
  if (options?.idempotencyKey) request.idempotencyKey = options.idempotencyKey;
  return stripeClient().refunds.create(params, request);
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
