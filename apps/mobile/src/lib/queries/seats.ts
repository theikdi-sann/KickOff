import { useQuery, type UseQueryOptions } from '@tanstack/react-query';
import {
  requireDefined,
  toSeatDto,
  toZoneAvailabilityDto,
  toZoneDto,
  type SeatDto,
  type ZoneAvailabilityDto,
} from '@kickoff/shared';
import { supabase } from '@/lib/supabase';

export function useZones(matchId: string | undefined) {
  return useQuery({
    queryKey: ['zones', matchId],
    enabled: Boolean(matchId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('zones')
        .select('*')
        .eq('match_id', requireDefined(matchId, 'match id'))
        .order('price_satang', { ascending: true });
      if (error) throw new Error(error.message);
      return (data ?? []).map(toZoneDto);
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
