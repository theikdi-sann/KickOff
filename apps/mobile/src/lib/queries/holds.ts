import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { HoldDto } from '@xclub/shared';
import { supabase } from '@/lib/supabase';

interface RpcHold {
  id: string;
  matchId: string;
  seatIds: string[];
  expiresAt: string;
}

export function useCreateHold() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: { matchId: string; seatIds: string[] }): Promise<HoldDto> => {
      const { data, error } = await supabase.rpc('create_hold', {
        p_match_id: input.matchId,
        p_seat_ids: input.seatIds,
      });
      if (error) throw new Error(error.message);

      const hold = data as unknown as RpcHold;
      return {
        id: hold.id,
        matchId: hold.matchId,
        seatIds: hold.seatIds,
        expiresAt: hold.expiresAt,
        createdAt: new Date().toISOString(),
      };
    },
    onSuccess: (hold) => {
      void queryClient.invalidateQueries({ queryKey: ['seats'] });
      queryClient.setQueryData(['hold', hold.id], hold);
    },
  });
}

export function useHold(holdId: string | undefined) {
  return useQuery({
    queryKey: ['hold', holdId],
    enabled: Boolean(holdId),
    queryFn: async (): Promise<HoldDto | null> => {
      const { data, error } = await supabase
        .from('seat_holds')
        .select('hold_group_id,seat_id,expires_at,released_at,created_at')
        .eq('hold_group_id', holdId!)
        .is('released_at', null)
        .order('created_at', { ascending: true });
      if (error) throw new Error(error.message);
      if (!data || data.length === 0) return null;

      const seatIds = data.map((row) => row.seat_id);
      const { data: seats, error: seatError } = await supabase
        .from('seats')
        .select('id,zone_id')
        .in('id', seatIds);
      if (seatError) throw new Error(seatError.message);

      const zoneIds = [...new Set((seats ?? []).map((seat) => seat.zone_id))];
      const { data: zones, error: zoneError } = await supabase
        .from('zones')
        .select('id,match_id')
        .in('id', zoneIds);
      if (zoneError) throw new Error(zoneError.message);

      const first = data[0]!;
      return {
        id: first.hold_group_id,
        matchId: zones?.[0]?.match_id ?? '',
        seatIds,
        expiresAt: first.expires_at,
        releasedAt: first.released_at,
        createdAt: first.created_at,
      };
    },
  });
}

export function useReleaseHold() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (holdId: string): Promise<number> => {
      const { data, error } = await supabase.rpc('release_hold', { p_hold_id: holdId });
      if (error) throw new Error(error.message);
      return (data as number | null) ?? 0;
    },
    onSuccess: (_count, holdId) => {
      queryClient.removeQueries({ queryKey: ['hold', holdId] });
      void queryClient.invalidateQueries({ queryKey: ['seats'] });
    },
  });
}
