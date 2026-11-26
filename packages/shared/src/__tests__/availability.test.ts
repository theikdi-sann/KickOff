import { describe, expect, it } from 'vitest';

import {
  isAvailabilityStale,
  potentialRevenueMinorUnits,
  SEAT_AVAILABILITY_STALE_MS,
  sellThroughPercent,
  summariseAvailability,
  toZoneAvailabilityDto,
  type ZoneAvailabilityDto,
  type ZoneAvailabilityRow,
} from '../availability';

// Phase C — F-17: sell-through must come from the authoritative
// `zone_availability` view, not from the browser-side zone layout.
//
// The layout (`rows.length * seatsPerRow`) is what the club *asked* for; the
// view counts the seats that actually exist and are actually free — a seat
// reserved by a pending order is not available, and the browser could not
// know that. Computing the number in the browser therefore produced a figure
// the database disagreed with.
//
// The shared package owns the mapping and the arithmetic (D-17), so both apps
// read the same numbers the same way.

const northStand: ZoneAvailabilityRow = {
  zone_id: 'zone-north',
  total_seats: 72,
  available_seats: 60,
  zones: { match_id: 'm-bkk' },
};

const vipStand: ZoneAvailabilityRow = {
  zone_id: 'zone-vip',
  total_seats: 40,
  available_seats: 40,
  zones: { match_id: 'm-bkk' },
};

const otherMatch: ZoneAvailabilityRow = {
  zone_id: 'zone-east',
  total_seats: 72,
  available_seats: 10,
  zones: { match_id: 'm-cmi' },
};

/**
 * Maps view rows onto the wire shape, dropping the rows that have no match.
 * @param rows the view rows
 * @returns the mapped zones
 */
function mapZones(rows: readonly ZoneAvailabilityRow[]): ZoneAvailabilityDto[] {
  return rows.flatMap((row) => {
    const zone = toZoneAvailabilityDto(row);
    return zone ? [zone] : [];
  });
}

describe('toZoneAvailabilityDto', () => {
  it('maps a view row onto the wire shape', () => {
    expect(toZoneAvailabilityDto(northStand)).toEqual({
      zoneId: 'zone-north',
      matchId: 'm-bkk',
      totalSeats: 72,
      availableSeats: 60,
    });
  });

  it('treats a null count as zero rather than as NaN', () => {
    const row: ZoneAvailabilityRow = {
      zone_id: 'zone-vip',
      total_seats: null,
      available_seats: null,
      zones: { match_id: 'm-bkk' },
    };

    expect(toZoneAvailabilityDto(row)).toEqual({
      zoneId: 'zone-vip',
      matchId: 'm-bkk',
      totalSeats: 0,
      availableSeats: 0,
    });
  });

  it('drops a zone that no longer belongs to a match', () => {
    const orphan: ZoneAvailabilityRow = {
      zone_id: 'zone-gone',
      total_seats: 10,
      available_seats: 10,
      zones: null,
    };

    expect(toZoneAvailabilityDto(orphan)).toBeNull();
  });
});

describe('summariseAvailability', () => {
  it('sums capacity and availability per match', () => {
    const summary = summariseAvailability(mapZones([northStand, vipStand, otherMatch]));

    expect(summary['m-bkk']).toEqual({
      matchId: 'm-bkk',
      capacity: 112,
      available: 100,
      zoneCount: 2,
    });
    expect(summary['m-cmi']).toEqual({
      matchId: 'm-cmi',
      capacity: 72,
      available: 10,
      zoneCount: 1,
    });
  });

  it('reports nothing for an empty set of rows', () => {
    expect(summariseAvailability([])).toEqual({});
  });
});

describe('sellThroughPercent', () => {
  it('is the sold share of the capacity', () => {
    expect(sellThroughPercent(56, 112)).toBe(50);
  });

  it('is zero when there is no capacity to sell', () => {
    expect(sellThroughPercent(0, 0)).toBe(0);
    expect(sellThroughPercent(3, 0)).toBe(0);
  });

  it('never exceeds a hundred per cent, even if the sold count overshoots', () => {
    expect(sellThroughPercent(120, 112)).toBe(100);
  });
});

describe('potentialRevenueMinorUnits', () => {
  it('prices every seat the club actually has, at the zone price', () => {
    const revenue = potentialRevenueMinorUnits(
      [
        { id: 'zone-north', priceMinorUnits: 25000 },
        { id: 'zone-vip', priceMinorUnits: 50000 },
      ],
      mapZones([northStand, vipStand]),
    );

    expect(revenue).toBe(72 * 25000 + 40 * 50000);
  });

  it('ignores a zone with no seat count', () => {
    const revenue = potentialRevenueMinorUnits(
      [{ id: 'zone-vip', priceMinorUnits: 50000 }],
      [{ zone_id: 'zone-vip', totalSeats: 0, availableSeats: 0, matchId: 'm-bkk' }],
    );

    expect(revenue).toBe(0);
  });
});

// NFR-13 — “a value older than 5 s is marked stale, never shown as current.”
// Exactly five seconds is still current; the first millisecond after is not.
describe('isAvailabilityStale', () => {
  const updatedAt = 1_700_000_000_000;

  it('keeps a value current inside the five-second budget', () => {
    expect(SEAT_AVAILABILITY_STALE_MS).toBe(5_000);
    expect(isAvailabilityStale(updatedAt, updatedAt + 4_999)).toBe(false);
  });

  it('treats the exact five-second boundary as current', () => {
    expect(isAvailabilityStale(updatedAt, updatedAt + 5_000)).toBe(false);
  });

  it('marks a value stale one millisecond past the boundary', () => {
    expect(isAvailabilityStale(updatedAt, updatedAt + 5_001)).toBe(true);
  });

  it('honours a caller-supplied budget', () => {
    expect(isAvailabilityStale(updatedAt, updatedAt + 1_001, 1_000)).toBe(true);
  });

  it('never marks missing data stale (there is nothing to label)', () => {
    expect(isAvailabilityStale(0, updatedAt + 60_000)).toBe(false);
    expect(isAvailabilityStale(Number.NaN, updatedAt + 60_000)).toBe(false);
  });
});
