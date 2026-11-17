"use client";

import { useQuery } from "@tanstack/react-query";
import { PLATFORM_DISPLAY, displayFromTenant, type ClubDisplay } from "@kickoff/shared";
import { createClient } from "@/lib/supabase/client";

/**
 * The club this session writes to — the same value the database uses for
 * `tenant_id` defaults and RLS (`current_tenant()`: the JWT's
 * `app_metadata.tenant_id`, falling back to the default club while the
 * claim does not exist yet).
 *
 * Per-club uniques (0046) make name lookups ambiguous without it: two clubs
 * may hold a venue or a setting with the same name, and the catalogue read
 * side is deliberately open, so RLS does not scope these reads for us.
 */
export async function currentTenantId(): Promise<string> {
  const { data, error } = await createClient().rpc("current_tenant");
  if (error) throw new Error(error.message);
  if (!data) throw new Error("current_tenant() resolved to no club");
  return data;
}

/**
 * The club's display config — how it charges, speaks and keeps time — from
 * the `tenants` branding row (`currency`/`locale` since `0040`, `timezone`
 * since `0053`). The console's prices and kickoff times are the club's, not
 * the platform's; the platform default stands in until the row arrives and
 * if the read fails (C8.2d).
 */
export function useTenantDisplay(): ClubDisplay {
  const { data } = useQuery({
    queryKey: ["tenant-display"],
    staleTime: Infinity,
    queryFn: async () => {
      const { data, error } = await createClient()
        .from("tenants")
        .select("currency,locale,timezone,status")
        .eq("status", "active")
        .order("created_at", { ascending: true })
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
