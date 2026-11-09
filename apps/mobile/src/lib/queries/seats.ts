import { useQuery } from '@tanstack/react-query';
import { toSeatDto, toZoneDto } from '@xclub/shared';
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

export function useSeatMap(zoneId: string | undefined) {
  return useQuery({
    queryKey: ['seats', zoneId],
    enabled: Boolean(zoneId),
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
