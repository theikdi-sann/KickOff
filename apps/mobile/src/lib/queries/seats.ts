import { useQuery, type UseQueryOptions } from '@tanstack/react-query';
import {
  requireDefined,
  toSeatDto,
  toZoneAvailabilityDto,
  zoneDtosWithPrices,
  type SeatDto,
  type ZoneAvailabilityDto,
} from '@kickoff/shared';
import { supabase } from '@/lib/supabase';

export function useZones(matchId: string | undefined) {
  return useQuery({
    queryKey: ['zones', matchId],
    enabled: Boolean(matchId),
    queryFn: async () => {
      const match = requireDefined(matchId, 'match id');
      // Price lives on `match_zone_prices`, so the zone row alone cannot
      // answer "what does this cost" — both tables come back together.
      const [zones, prices] = await Promise.all([
        supabase.from('zones').select('*').eq('match_id', match),
        supabase
          .from('match_zone_prices')
          .select('zone_id, price_minor_units')
          .eq('match_id', match),
      ]);
      if (zones.error) throw new Error(zones.error.message);
      if (prices.error) throw new Error(prices.error.message);
      return zoneDtosWithPrices(zones.data ?? [], prices.data ?? []);
    },
  });
}

/**
 * The seats of a match that are already taken, by id.
 *
 * A seat has no status column (`0043`): occupancy is derived from active holds
 * and live orders, and this view is the public projection of that derivation —
 * it says which seats, never who holds them. Own rows come from
 * `useMyActiveHolds` / `usePendingOrderSeats`, which do carry identity.
 *
 * The key is namespaced under `'seats'` so the existing
 * `invalidateQueries({ queryKey: ['seats'] })` calls refresh the derived set
 * along with the raw rows.
 */
export function useTakenSeats(
  matchId: string | undefined,
  options: { refetchInterval?: number } = {},
) {
  return useQuery({
    queryKey: ['seats', 'taken', matchId],
    enabled: Boolean(matchId),
    refetchInterval: options.refetchInterval ?? false,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('seat_availability')
        .select('seat_id')
        .eq('match_id', requireDefined(matchId, 'match id'));
      if (error) throw new Error(error.message);
      return new Set((data ?? []).map((row) => row.seat_id));
    },
  });
}

export function useSeatMap(
  zoneId: string | undefined,
  options: {
    /** Poll while the seat map is open so availability stays live. */
    refetchInterval?: UseQueryOptions<SeatDto[]>['refetchInterval'];
  } = {},
) {
  return useQuery({
    queryKey: ['seats', zoneId],
    enabled: Boolean(zoneId),
    refetchInterval: options.refetchInterval ?? false,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('seats')
        .select('*')
        .eq('zone_id', requireDefined(zoneId, 'zone id'))
        .order('row_label', { ascending: true })
        .order('number', { ascending: true });
      if (error) throw new Error(error.message);
      return (data ?? []).map(toSeatDto);
    },
  });
}

/**
 * Per-zone capacity and live availability from the `zone_availability` view.
 *
 * The view is the only place that knows how many seats are free right now —
 * a seat reserved by a pending order is not available. The mapping is owned
 * by the shared package, so the app and the staff console read the same
 * numbers the same way.
 */
export function useZoneAvailability(matchId: string | undefined) {
  return useQuery({
    queryKey: ['zone-availability', matchId],
    enabled: Boolean(matchId),
    queryFn: async (): Promise<Record<string, ZoneAvailabilityDto>> => {
      const { data: zones, error } = await supabase
        .from('zones')
        .select('id')
        .eq('match_id', requireDefined(matchId, 'match id'));
      if (error) throw new Error(error.message);

      const ids = (zones ?? []).map((zone) => zone.id);
      if (ids.length === 0) return {};

      const { data, error: availabilityError } = await supabase
        .from('zone_availability')
        .select('zone_id,total_seats,available_seats')
        .in('zone_id', ids);
      if (availabilityError) throw new Error(availabilityError.message);

      return Object.fromEntries(
        (data ?? []).flatMap((row) => {
          const zone = toZoneAvailabilityDto({
            zone_id: row.zone_id,
            total_seats: row.total_seats,
            available_seats: row.available_seats,
            zones: { match_id: requireDefined(matchId, 'match id') },
          });
          return zone ? [[zone.zoneId, zone] as const] : [];
        }),
      );
    },
  });
}
