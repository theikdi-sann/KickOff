import { useQuery, type UseQueryOptions } from '@tanstack/react-query';
import { toSeatDto, toZoneDto, type SeatDto } from '@kickoff/shared';
import { supabase } from '@/lib/supabase';

export function useZones(matchId: string | undefined) {
  return useQuery({
    queryKey: ['zones', matchId],
    enabled: Boolean(matchId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('zones')
        .select('*')
        .eq('match_id', matchId!)
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
        .eq('zone_id', zoneId!)
        .order('row_label', { ascending: true })
        .order('number', { ascending: true });
      if (error) throw new Error(error.message);
      return (data ?? []).map(toSeatDto);
    },
  });
}

export interface ZoneAvailability {
  total: number;
  available: number;
}

/** Per-zone capacity and live availability from the `zone_availability` view. */
export function useZoneAvailability(matchId: string | undefined) {
  return useQuery({
    queryKey: ['zone-availability', matchId],
    enabled: Boolean(matchId),
    queryFn: async (): Promise<Record<string, ZoneAvailability>> => {
      const { data: zones, error } = await supabase
        .from('zones')
        .select('id')
        .eq('match_id', matchId!);
      if (error) throw new Error(error.message);

      const ids = (zones ?? []).map((zone) => zone.id);
      if (ids.length === 0) return {};

      const { data, error: availabilityError } = await supabase
        .from('zone_availability')
        .select('zone_id,total_seats,available_seats')
        .in('zone_id', ids);
      if (availabilityError) throw new Error(availabilityError.message);

      return Object.fromEntries(
        (data ?? []).map((row) => [
          row.zone_id,
          { total: row.total_seats ?? 0, available: row.available_seats ?? 0 },
        ]),
      );
    },
  });
}
