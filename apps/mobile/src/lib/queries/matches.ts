import { useQuery } from '@tanstack/react-query';
import { toMatchDto } from '@xclub/shared';
import { supabase } from '@/lib/supabase';

export function useMatches() {
  return useQuery({
    queryKey: ['matches'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('matches')
        .select('*')
        .order('kickoff_at', { ascending: true });
      if (error) throw new Error(error.message);
      return (data ?? []).map(toMatchDto);
    },
  });
}

export function useMatch(id: string | undefined) {
  return useQuery({
    queryKey: ['match', id],
    enabled: Boolean(id),
    queryFn: async () => {
      const { data, error } = await supabase.from('matches').select('*').eq('id', id!).single();
      if (error) throw new Error(error.message);
      return toMatchDto(data);
    },
  });
}

export function useNextMatch() {
  return useQuery({
    queryKey: ['match', 'next'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('matches')
        .select('*')
        .eq('status', 'upcoming')
        .gte('kickoff_at', new Date().toISOString())
        .order('kickoff_at', { ascending: true })
        .limit(1)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data ? toMatchDto(data) : null;
    },
  });
}
