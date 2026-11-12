import { describe, expect, it } from 'vitest';

import * as schemas from '../schemas';

/**
 * Phase B — punch list #13: reschedule rules (never past / inside the lock
 * window, never earlier, cap 10 days, reason always required). Rules live in
 * the shared Zod schema — no DB trigger or RPC.
 *
 * Fixed clock so every rule is deterministic:
 *   now    = 2026-11-10T10:00+07:00
 *   current kickoff = 2026-11-14T18:00+07:00 (the seeded fixture)
 *   lock   = 15 minutes (kickoff_lock_minutes default)
 */
const now = '2026-11-10T10:00:00+07:00';
const currentKickoffAt = '2026-11-14T18:00:00+07:00';
const lockMinutes = 15;

function reschedule() {
  return schemas.adminRescheduleSchema({ currentKickoffAt, now, lockMinutes });
}

describe('adminRescheduleSchema (RS)', () => {
  it('RS-1 rejects a kickoff inside the kickoff lock window', () => {
    // Future, but only 5 minutes away — inside the 15-minute lock.
    const result = reschedule().safeParse({
      kickoffAt: '2026-11-10T10:05:00+07:00',
      reason: 'TV broadcast request',
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => /lock window/i.test(issue.message))).toBe(true);
    }
  });

  it('RS-2 rejects a kickoff in the past', () => {
    // Yesterday: before now, so it can never be a valid new kickoff.
    const result = reschedule().safeParse({
      kickoffAt: '2026-11-09T18:00:00+07:00',
      reason: 'Wrong tap on the picker',
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => /future/i.test(issue.message))).toBe(true);
    }
  });

  it('RS-3 rejects a kickoff earlier than the current one', () => {
    // Two days out (future, outside the lock) but before the fixture's
    // current 14 Nov kickoff — a reschedule may never move a match back.
    const result = reschedule().safeParse({
      kickoffAt: '2026-11-12T18:00:00+07:00',
      reason: 'Coach asked for Friday',
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => /earlier/i.test(issue.message))).toBe(true);
    }
  });

  it('RS-4 rejects a kickoff more than 10 days after the current one', () => {
    // Current is 14 Nov; 25 Nov is 11 days out — past the 10-day cap.
    const result = reschedule().safeParse({
      kickoffAt: '2026-11-25T18:00:00+07:00',
      reason: 'Opponent asked to postpone',
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => /10 days/i.test(issue.message))).toBe(true);
    }
  });

  it('RS-4b accepts a valid reschedule inside every rule', () => {
    // Two days after the current kickoff, well outside the lock, with a reason.
    const result = reschedule().safeParse({
      kickoffAt: '2026-11-16T18:00:00+07:00',
      reason: 'TV broadcast request',
    });

    expect(result.success).toBe(true);
  });

  it('RS-5 requires a reason on every reschedule', () => {
    const kickoffAt = '2026-11-16T18:00:00+07:00';

    const missing = reschedule().safeParse({ kickoffAt });
    expect(missing.success).toBe(false);

    const blank = reschedule().safeParse({ kickoffAt, reason: '   ' });
    expect(blank.success).toBe(false);

    const tooLong = reschedule().safeParse({ kickoffAt, reason: 'x'.repeat(401) });
    expect(tooLong.success).toBe(false);

    const atLimit = reschedule().safeParse({ kickoffAt, reason: 'x'.repeat(400) });
    expect(atLimit.success).toBe(true);
  });

  it('RS-6 rejects rescheduling a fixture that is not upcoming', () => {
    const result = schemas
      .adminRescheduleSchema({ currentKickoffAt, now, lockMinutes, status: 'live' })
      .safeParse({
        kickoffAt: '2026-11-16T18:00:00+07:00',
        reason: 'Cannot move a match that has started',
      });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => /upcoming/i.test(issue.message))).toBe(true);
    }

    const completed = schemas
      .adminRescheduleSchema({ currentKickoffAt, now, lockMinutes, status: 'completed' })
      .safeParse({ kickoffAt: '2026-11-16T18:00:00+07:00', reason: 'Too late' });
    expect(completed.success).toBe(false);
  });
});
