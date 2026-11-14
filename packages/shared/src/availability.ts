/**
 * Availability — the authoritative capacity and free-seat counts.
 *
 * `public.zone_availability` is the only place that knows how many seats a
 * club actually has and how many are free right now: it counts the seat rows
 * that exist and excludes the ones a pending order has reserved. The zone
 * layout (`rows.length * seatsPerRow`) is what the club *asked* for, and the
 * two can disagree.
 *
 * Sell-through used to be computed in the browser from the layout, which
 * meant the console could disagree with the database about how many seats
 * were left. The mapping and the arithmetic live here so both apps read the
 * same numbers the same way.
 */

/** A row of the `public.zone_availability` view, with its match. */
export interface ZoneAvailabilityRow {
  zone_id: string;
  total_seats: number | null;
  available_seats: number | null;
  /** The zone's match — a view row without it is not usable. */
  zones: { match_id: string } | null;
}

/** Per-zone availability, as the apps consume it. */
export interface ZoneAvailabilityDto {
  zoneId: string;
  matchId: string;
  totalSeats: number;
  availableSeats: number;
}

/** A match's capacity and free seats, summed over its zones. */
export interface MatchAvailabilityDto {
  matchId: string;
  /** How many seats exist for the match. */
  capacity: number;
  /** How many of them are free to sell right now. */
  available: number;
  /** How many zones the capacity is spread over. */
  zoneCount: number;
}

/**
 * Maps a view row onto the wire shape.
 *
 * @param row a row of `public.zone_availability`
 * @returns the mapped zone, or `null` when the zone has no match
 */
export function toZoneAvailabilityDto(row: ZoneAvailabilityRow): ZoneAvailabilityDto | null {
  const matchId = row.zones?.match_id;
  if (!matchId) return null;

  return {
    zoneId: row.zone_id,
    matchId,
    totalSeats: row.total_seats ?? 0,
    availableSeats: row.available_seats ?? 0,
  };
}

/**
 * Sums the availability of every zone, grouped by match.
 *
 * @param zones the mapped zone availability
 * @returns the capacity and free seats of every match in the zones
 */
export function summariseAvailability(
  zones: readonly ZoneAvailabilityDto[],
): Record<string, MatchAvailabilityDto> {
  const summary: Record<string, MatchAvailabilityDto> = {};

  for (const zone of zones) {
    const current = summary[zone.matchId];
    summary[zone.matchId] = {
      matchId: zone.matchId,
      capacity: (current?.capacity ?? 0) + zone.totalSeats,
      available: (current?.available ?? 0) + zone.availableSeats,
      zoneCount: (current?.zoneCount ?? 0) + 1,
    };
  }

  return summary;
}

/**
 * The share of the capacity that has been sold, as a whole percentage.
 *
 * @param sold how many seats have been sold
 * @param capacity how many seats exist
 * @returns the percentage, never above 100
 */
export function sellThroughPercent(sold: number, capacity: number): number {
  if (capacity <= 0) return 0;
  return Math.min(100, Math.round((sold / capacity) * 100));
}

/**
 * The revenue the match would make if every seat were sold.
 *
 * @param zones the zones, with the price of a seat in each
 * @param availability the availability rows the prices belong to
 * @returns the potential revenue, in satang
 */
export function potentialRevenueMinorUnits(
  zones: readonly { id: string; priceMinorUnits: number }[],
  availability: readonly { zoneId: string; totalSeats: number }[],
): number {
  const seatsByZone = new Map(availability.map((zone) => [zone.zoneId, zone.totalSeats]));

  return zones.reduce((total, zone) => {
    return total + (seatsByZone.get(zone.id) ?? 0) * zone.priceMinorUnits;
  }, 0);
}
