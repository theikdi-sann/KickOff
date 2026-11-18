/**
 * The match clock — what a fixture *is* at a point in time.
 *
 * `matches.status` records what the club intends; `kickoff_at` records when
 * the match actually happens. The console's clock flips the stored status, but
 * the read side must never depend on that having run: a fixture whose kickoff
 * has passed is never "upcoming", even if the row still says so.
 */
import type { MatchStatus } from './entities';

/** Football clock: 90 minutes plus a 15-minute half-time, plus stoppage. */
export const MATCH_PLAYING_MINUTES = 120;

const MINUTE_MS = 60_000;

export type MatchPhase =
  | 'scheduled'
  | 'live'
  | 'awaitingResult'
  | 'played'
  | 'postponed'
  | 'cancelled';

/** The minimum shape a fixture needs for the clock to classify it. */
export interface MatchClockInput {
  status: MatchStatus;
  kickoffAt: string;
  homeScore?: number | null;
  awayScore?: number | null;
}

function hasResult(match: MatchClockInput): boolean {
  return match.homeScore !== null && match.homeScore !== undefined &&
    match.awayScore !== null && match.awayScore !== undefined;
}

/**
 * New orders are only accepted before kickoff, never after it.
 */
export function isMatchOnSale(match: MatchClockInput, now: Date = new Date()): boolean {
  return matchPhase(match, now) === 'scheduled';
}

/**
 * Classify a fixture for display. `now` is injectable so callers and tests
 * agree on the clock.
 */
export function matchPhase(match: MatchClockInput, now: Date = new Date()): MatchPhase {
  if (match.status === 'cancelled') return 'cancelled';
  if (match.status === 'postponed') return 'postponed';

  const kickoff = new Date(match.kickoffAt).getTime();
  if (Number.isNaN(kickoff)) return 'scheduled';

  const elapsed = now.getTime() - kickoff;

  if (match.status === 'completed') {
    return hasResult(match) ? 'played' : 'awaitingResult';
  }

  if (elapsed >= MATCH_PLAYING_MINUTES * MINUTE_MS) {
    return hasResult(match) ? 'played' : 'awaitingResult';
  }

  if (elapsed >= 0) return 'live';

  return 'scheduled';
}

export interface MatchGroups<T extends MatchClockInput> {
  /** The soonest fixture that has not kicked off, if any. */
  nextMatch?: T;
  /** Scheduled fixtures, soonest first. */
  upcoming: T[];
  live: T[];
  /** Kickoff passed (or completed) with no score — admin work, never fan results. */
  awaitingResult: T[];
  /** Completed fixtures with a score. */
  results: T[];
  postponed: T[];
  cancelled: T[];
}

/**
 * Split fixtures into the sections the apps render. The input order is not
 * trusted: every group is ordered by kickoff, and `nextMatch` is the soonest
 * scheduled fixture — never "the first row whose status says upcoming".
 */
export function groupMatches<T extends MatchClockInput>(
  matches: readonly T[],
  now: Date = new Date(),
): MatchGroups<T> {
  const chronological = [...matches].sort(
    (a, b) => new Date(a.kickoffAt).getTime() - new Date(b.kickoffAt).getTime(),
  );

  const groups: MatchGroups<T> = {
    upcoming: [],
    live: [],
    awaitingResult: [],
    results: [],
    postponed: [],
    cancelled: [],
  };

  for (const match of chronological) {
    switch (matchPhase(match, now)) {
      case 'scheduled':
        groups.upcoming.push(match);
        break;
      case 'live':
        groups.live.push(match);
        break;
      case 'awaitingResult':
        groups.awaitingResult.push(match);
        break;
      case 'played':
        groups.results.push(match);
        break;
      case 'postponed':
        groups.postponed.push(match);
        break;
      case 'cancelled':
        groups.cancelled.push(match);
        break;
    }
  }

  groups.nextMatch = groups.upcoming[0];
  return groups;
}
