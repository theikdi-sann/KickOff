/**
 * Probe depth.
 *
 * The health probe is reachable without a user JWT (a load balancer or an
 * uptime check cannot present one). The expensive checks — the live Stripe
 * API call — must therefore never run for an anonymous caller: they would
 * spend the account's API budget and could hit the rate limit that checkout
 * depends on.
 *
 * A caller that presents the metrics token gets the deep checks.
 */
import { metricsTokenMatches } from "./metrics.ts";

/** How much a probe is allowed to check. */
export type ProbeDepth = "shallow" | "deep";

/**
 * Decides how deep a probe may go.
 *
 * @param {string | null} providedToken the `x-metrics-token` header
 * @param {string} expectedToken the configured metrics token
 * @returns {ProbeDepth} `deep` only for an authorised caller
 */
export function probeDepth(providedToken: string | null, expectedToken: string): ProbeDepth {
  return metricsTokenMatches(providedToken, expectedToken) ? "deep" : "shallow";
}
