import { useQuery } from '@tanstack/react-query';
import { PLATFORM_DISPLAY, displayFromTenant, type ClubDisplay } from '@kickoff/shared';
import { supabase } from '@/lib/supabase';

/**
 * The club's display config — how it charges, speaks and keeps time — from
 * the `tenants` branding row (`currency`/`locale` since `0040`, `timezone`
 * since `0053`).
 *
 * Cached for the session (`staleTime: Infinity`): the club's settings do not
 * change under a running app. The platform default stands in until the row
 * arrives — for the single-club deployment that default *is* the club, so no
 * price ever flashes in the wrong currency — and it stays if the read fails,
 * because a failed read is a network problem, not a different club.
 *
 * When several clubs are active (the multi-club world after C9's
 * `bootstrap`), this resolves the first active one — the claim will name the
 * club then, and the query key will carry it.
 */
export function useTenantDisplay(): ClubDisplay {
  const { data } = useQuery({
    queryKey: ['tenant-display'],
    staleTime: Infinity,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tenants')
        .select('currency,locale,timezone,status')
        .eq('status', 'active')
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) return PLATFORM_DISPLAY;
      return displayFromTenant(data);
    },
    placeholderData: PLATFORM_DISPLAY,
  });

  return data ?? PLATFORM_DISPLAY;
}
