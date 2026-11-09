import { AppError } from "./errors.ts";
import { logger } from "./logger.ts";
import { serviceClient } from "./supabase.ts";

export const DEFAULT_WINDOW_SECONDS = 60;
export const DEFAULT_MAX_HITS = 30;

export interface RateLimitOptions {
  windowSeconds?: number;
  maxHits?: number;
}

/** Best-effort client IP (Supabase forwards the origin through these headers). */
export function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return (
    request.headers.get("x-real-ip") ??
    request.headers.get("cf-connecting-ip") ??
    "unknown"
  );
}

/**
 * Calls `consume_rate_limit` keyed by action + IP. Throws a 429 AppError when
 * the caller exceeds the window budget. Fail-closed on database errors.
 */
export async function enforceRateLimit(
  request: Request,
  action: string,
  options: RateLimitOptions = {},
): Promise<void> {
  const key = `${action}:${clientIp(request)}`;
  const db = serviceClient();
  const { data, error } = await db.rpc("consume_rate_limit", {
    p_key: key,
    p_window_seconds: options.windowSeconds ?? DEFAULT_WINDOW_SECONDS,
    p_max_hits: options.maxHits ?? DEFAULT_MAX_HITS,
  });

  if (error) {
    logger.error("rate_limit.unavailable", { action, error: error.message });
    throw new AppError("internal", "Rate limiter unavailable");
  }
  if (data === false) {
    throw new AppError("rate_limited", "Too many requests. Try again shortly.");
  }
}
