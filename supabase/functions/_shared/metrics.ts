/**
 * Pure helpers behind the `metrics` Edge Function (P11-18).
 *
 * Kept separate from the handler so the token guard and the aggregations can
 * be unit-tested without a database or a running server.
 */

/** Constant-time-ish comparison: the whole string is always walked. */
export function metricsTokenMatches(provided: string | null, expected: string): boolean {
  if (!provided || !expected) return false;
  if (provided.length !== expected.length) return false;

  let mismatch = 0;
  for (let i = 0; i < expected.length; i += 1) {
    mismatch |= provided.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return mismatch === 0;
}

/**
 * Contention signal: a seat that collected more than one hold row during the
 * window was fought over by supporters (the first holder wins the unique
 * index), so it is reported as a conflict.
 */
export function countHoldConflicts(seatIds: readonly string[]): number {
  const seen = new Set<string>();
  const conflicted = new Set<string>();
  for (const seatId of seatIds) {
    if (seen.has(seatId)) conflicted.add(seatId);
    else seen.add(seatId);
  }
  return conflicted.size;
}

export interface ScanResultCounts {
  invalid: number;
  wrongMatch: number;
}

/** A failed scan is anything the gate refused as invalid or wrong-fixture. */
export function failedScans(counts: ScanResultCounts): number {
  return counts.invalid + counts.wrongMatch;
}
