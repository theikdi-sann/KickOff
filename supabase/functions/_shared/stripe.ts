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

/**
 * Creates a club's Express connected account (ADR-003, C9).
 *
 * The club is the merchant of record: charges run *on* this account and the
 * platform fee is taken by Stripe from them, so the account exists before the
 * first checkout for that club.
 *
 * `idempotencyKey` is the tenant: two clicks (or two tabs) on *Onboard* must
 * resolve to one account, never two — Stripe replays the first response
 * within its 24h idempotency window.
 */
export function createExpressAccount(
  params: Stripe.AccountCreateParams,
  options?: { idempotencyKey?: string },
): Promise<Stripe.Account> {
  const request: Stripe.RequestOptions = {};
  if (options?.idempotencyKey) request.idempotencyKey = options.idempotencyKey;
  return stripeClient().accounts.create(params, request);
}

/**
 * The Stripe-hosted link a club completes to activate its account (C9).
 *
 * `type: "account_onboarding"` covers both a fresh account and a returned
 * one — Stripe keeps the account's state, the link is just the way back in.
 */
export function createAccountLink(
  params: Stripe.AccountLinkCreateParams,
): Promise<Stripe.AccountLink> {
  return stripeClient().accountLinks.create(params);
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
