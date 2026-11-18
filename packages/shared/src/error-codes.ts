/**
 * The canonical error contract.
 *
 * Every Edge Function and both apps speak this vocabulary. Supabase deploys
 * only `supabase/functions/**`, so the Edge Functions cannot import this file
 * at runtime — `scripts/sync-error-codes.mjs` generates their copy from this
 * source and `scripts/tests/hygiene.test.mjs` fails if it drifts.
 *
 * One fact, one home: adding a code here adds it everywhere.
 */
export const ERROR_CODES = [
  'unauthorized',
  'forbidden',
  'not_found',
  'conflict',
  'match_started',
  'validation',
  'rate_limited',
  'payment_required',
  'internal',
] as const;

/** Machine-readable error code returned by any API surface. */
export type ErrorCode = (typeof ERROR_CODES)[number];

/**
 * HTTP status for each code. A client can branch on the status without
 * knowing the code vocabulary; the code carries the precise reason.
 */
export const ERROR_STATUS: Record<ErrorCode, number> = {
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  match_started: 409,
  validation: 422,
  rate_limited: 429,
  payment_required: 402,
  internal: 500,
};

/** Narrows an unknown value to an error code. */
export function isErrorCode(value: unknown): value is ErrorCode {
  return typeof value === 'string' && (ERROR_CODES as readonly string[]).includes(value);
}
