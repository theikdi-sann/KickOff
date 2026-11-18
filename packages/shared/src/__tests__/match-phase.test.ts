import { describe, expect, it } from 'vitest';

import { groupMatches, isGateFixtureOpen, isMatchOnSale, matchPhase } from '../match-phase';

/**
 * The match clock: a fixture's displayed phase is decided by `kickoffAt`, not
 * by the stored `status` alone. A row that still says `upcoming` two days after
 * the final whistle must never be offered as the next match.
 *
 * Fixed clock so every case is deterministic:
 *   kickoff = 2026-10-17T18:00+07:00
 */
const kickoffAt = '2026-10-17T18:00:00+07:00';
const MINUTE_MS = 60_000;

function at(minutesFromKickoff: number): Date {
  return new Date(new Date(kickoffAt).getTime() + minutesFromKickoff * MINUTE_MS);
}

const storedUpcoming = {
  status: 'upcoming' as const,
  kickoffAt,
  homeScore: null,
  awayScore: null,
};

describe('matchPhase (MP)', () => {
  it('MP-1 a past match still stored as upcoming is never scheduled', () => {
    // 17 Oct kickoff, viewed three days later with the status never touched.
    expect(matchPhase(storedUpcoming, at(3 * 24 * 60))).toBe('awaitingResult');
    // Past kickoff but inside the playing window.
    expect(matchPhase(storedUpcoming, at(60))).toBe('live');
  });

  it('MP-2 the playing window opens at kickoff and closes at kickoff+2h', () => {
    expect(matchPhase(storedUpcoming, at(-1))).toBe('scheduled');
    expect(matchPhase(storedUpcoming, at(0))).toBe('live');
    expect(matchPhase(storedUpcoming, at(119))).toBe('live');
    expect(matchPhase(storedUpcoming, at(120))).toBe('awaitingResult');
  });

  it('MP-3 a completed match with a score is played; without one it awaits a result', () => {
    expect(
      matchPhase({ ...storedUpcoming, status: 'completed', homeScore: 2, awayScore: 1 }, at(200)),
    ).toBe('played');
    expect(matchPhase({ ...storedUpcoming, status: 'completed' }, at(200))).toBe('awaitingResult');
  });

  it('MP-4 postponed and cancelled are their own phases regardless of kickoff', () => {
    expect(matchPhase({ ...storedUpcoming, status: 'postponed' }, at(-60))).toBe('postponed');
    expect(matchPhase({ ...storedUpcoming, status: 'cancelled' }, at(200))).toBe('cancelled');
  });

  it('MP-5 only a scheduled fixture is on sale', () => {
    expect(isMatchOnSale(storedUpcoming, at(-1))).toBe(true);
    expect(isMatchOnSale(storedUpcoming, at(0))).toBe(false);
    expect(isMatchOnSale({ ...storedUpcoming, status: 'postponed' }, at(-1))).toBe(false);
    expect(isMatchOnSale({ ...storedUpcoming, status: 'cancelled' }, at(-1))).toBe(false);
  });

  it('MP-6 grouping never promotes a past fixture to next and hides unplayed results', () => {
    const past = { ...storedUpcoming, id: 'past' };
    const next = { ...storedUpcoming, id: 'next', kickoffAt: '2026-10-24T18:00:00+07:00' };
    const other = { ...storedUpcoming, id: 'later', kickoffAt: '2026-10-31T18:00:00+07:00' };
    const scored = {
      ...storedUpcoming,
      id: 'scored',
      status: 'completed' as const,
      homeScore: 1,
      awayScore: 0,
    };
    const unscored = { ...storedUpcoming, id: 'unscored', status: 'completed' as const };

    const groups = groupMatches([past, next, other, scored, unscored], at(3 * 24 * 60));

    expect(groups.nextMatch?.id).toBe('next');
    expect(groups.upcoming.map((match) => match.id)).toEqual(['next', 'later']);
    expect(groups.results.map((match) => match.id)).toEqual(['scored']);
    expect(groups.awaitingResult.map((match) => match.id)).toEqual(
      expect.arrayContaining(['past', 'unscored']),
    );
  });

  it('MP-7 a gate may admit only fixtures that are scheduled or live', () => {
    expect(isGateFixtureOpen(storedUpcoming, at(-1))).toBe(true);
    expect(isGateFixtureOpen(storedUpcoming, at(30))).toBe(true);
    expect(isGateFixtureOpen(storedUpcoming, at(180))).toBe(false);
    expect(isGateFixtureOpen({ ...storedUpcoming, status: 'completed' }, at(200))).toBe(false);
    expect(isGateFixtureOpen({ ...storedUpcoming, status: 'postponed' }, at(-60))).toBe(false);
    expect(isGateFixtureOpen({ ...storedUpcoming, status: 'cancelled' }, at(-60))).toBe(false);
  });
});
