// GENERATED FILE — do not edit.
// Source: packages/shared/src/error-codes.ts
// Regenerate: node scripts/sync-error-codes.mjs
//
// Supabase deploys only `supabase/functions/**`, so this copy cannot be an
// import from `@kickoff/shared`. It is generated instead of hand-written, and
// `scripts/tests/hygiene.test.mjs` fails if it drifts from the source.

/** Error codes returned by every Edge Function. */
export type ErrorCode =
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "conflict"
  | "validation"
  | "rate_limited"
  | "payment_required"
  | "internal";
