"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AUDIT_ACTIONS, recordAudit } from "@/lib/audit";
import { createClient } from "@/lib/supabase/client";
import { currentTenantId } from "@/lib/queries/tenant";

export interface AdminVenueInput {
  name: string;
  city?: string | null;
  address?: string | null;
}

function client() {
  return createClient();
}

/** Every venue of this club, ordered for the management table and the picker. */
export function useVenues() {
  return useQuery({
    queryKey: ["admin-venues"],
    queryFn: async () => {
      // 0046 scopes the list to the own club: the catalogue read policy is
      // deliberately open, so another club's venue would show up here.
      const tenantId = await currentTenantId();
      const { data, error } = await client()
        .from("venues")
        .select("*")
        .eq("tenant_id", tenantId)
        .order("name", { ascending: true });
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });
}

export function useCreateVenue() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: AdminVenueInput) => {
      const { data, error } = await client()
        .from("venues")
        .insert({
          name: input.name.trim(),
          city: input.city?.trim() || null,
          address: input.address?.trim() || null,
        })
        .select("*")
        .single();
      if (error) throw new Error(error.message);

      await recordAudit({
        action: AUDIT_ACTIONS.venueCreate,
        entity: "venues",
        entityId: data.id,
        metadata: { name: input.name.trim(), city: input.city?.trim() || null },
      });

      return data;
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["admin-venues"] }),
  });
}

export function useDeleteVenue() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      // Matches reference venues (venue_id) — the FK rejects a venue in use,
      // and the page surfaces that message instead of silently failing.
      const { error } = await client().from("venues").delete().eq("id", id);
      if (error) throw new Error(error.message);

      await recordAudit({
        action: AUDIT_ACTIONS.venueDelete,
        entity: "venues",
        entityId: id,
      });

      return id;
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["admin-venues"] }),
  });
}
