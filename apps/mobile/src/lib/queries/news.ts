import { useQuery } from '@tanstack/react-query';
import { toNewsDto } from '@kickoff/shared';
import { supabase } from '@/lib/supabase';

export function useNews() {
  return useQuery({
    queryKey: ['news'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('news_items')
        .select('*')
        .lte('published_at', new Date().toISOString())
        .order('published_at', { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []).map(toNewsDto);
    },
  });
}

export function useNewsItem(id: string | undefined) {
  return useQuery({
    queryKey: ['news', id],
    enabled: Boolean(id),
    queryFn: async () => {
      const { data, error } = await supabase.from('news_items').select('*').eq('id', id!).single();
      if (error) throw new Error(error.message);
      return toNewsDto(data);
    },
  });
}
