"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { requireDefined } from "@kickoff/shared";
import { AUDIT_ACTIONS, recordAudit } from "@/lib/audit";
import { createClient } from "@/lib/supabase/client";
import { currentTenantId } from "@/lib/queries/tenant";

export interface AdminVenueInput {
  name: string;
  city?: string | null;
  address?: string | null;
  isHome?: boolean;
}

export interface AdminVenue {
  id: string;
  name: string;
  city: string | null;
  address: string | null;
  isHome: boolean;
  capacity: number;
  zoneCount: number;
}

export interface AdminVenueZone {
  id: string;
  venueId: string;
  name: string;
  description: string;
  color: string;
  rows: string[];
  seatsPerRow: number;
  defaultPriceMinorUnits: number;
  capacity: number;
}

export interface VenueZoneInput {
  name: string;
  description: string;
  color: string;
  rows: string[];
  seatsPerRow: number;
  defaultPriceMinorUnits: number;
}

interface VenueRow {
  id: string;
  name: string;
  city: string | null;
  address: string | null;
  is_home: boolean;
}

interface VenueZoneRow {
  id: string;
  venue_id: string;
  name: string;
  description: string;
  color: string;
  rows: string[];
  seats_per_row: number;
  default_price_minor_units: number;
}

interface VenueCapacityRow {
  venue_id: string;
  capacity: number;
}

function client() {
  return createClient();
}

/** Every venue of this club with its derived capacity and zone count. */
export function useVenues() {
  return useQuery({
    queryKey: ["admin-venues"],
    queryFn: async (): Promise<AdminVenue[]> => {
      // 0046 scopes the list to the own club: the catalogue read policy is
      // deliberately open, so another club's venue would show up here.
      const tenantId = await currentTenantId();
      const db = client();
      const [venuesResult, capacityResult, zonesResult] = await Promise.all([
        db.from("venues").select("id,name,city,address,is_home").eq("tenant_id", tenantId).order("name"),
        db.from("venue_capacity").select("venue_id,capacity"),
        db.from("venue_zones").select("venue_id"),
      ]);
      if (venuesResult.error) throw new Error(venuesResult.error.message);
      if (capacityResult.error) throw new Error(capacityResult.error.message);
      if (zonesResult.error) throw new Error(zonesResult.error.message);

      const capacityByVenue = new Map(
        ((capacityResult.data ?? []) as VenueCapacityRow[]).map((row) => [
          row.venue_id,
          row.capacity,
        ]),
      );
      const zonesByVenue = new Map<string, number>();
      for (const row of (zonesResult.data ?? []) as Array<{ venue_id: string }>) {
        zonesByVenue.set(row.venue_id, (zonesByVenue.get(row.venue_id) ?? 0) + 1);
      }

      return ((venuesResult.data ?? []) as VenueRow[]).map((venue) => ({
        id: venue.id,
        name: venue.name,
        city: venue.city,
        address: venue.address,
        isHome: venue.is_home,
        capacity: capacityByVenue.get(venue.id) ?? 0,
        zoneCount: zonesByVenue.get(venue.id) ?? 0,
      }));
    },
  });
}

/** The venue's physical zones, with the seat count each generated. */
export function useVenueLayout(venueId: string | undefined) {
  return useQuery({
    queryKey: ["admin-venue-layout", venueId],
    enabled: Boolean(venueId),
    queryFn: async (): Promise<AdminVenueZone[]> => {
      const id = requireDefined(venueId, "venue id");
      const db = client();
      const zonesResult = await db
        .from("venue_zones")
        .select("*")
        .eq("venue_id", id)
        .order("name");
      if (zonesResult.error) throw new Error(zonesResult.error.message);

      const zoneIds = ((zonesResult.data ?? []) as VenueZoneRow[]).map((zone) => zone.id);
      const seatsResult = zoneIds.length
        ? await db.from("venue_seats").select("venue_zone_id").in("venue_zone_id", zoneIds)
        : { data: [], error: null };
      if (seatsResult.error) throw new Error(seatsResult.error.message);

      const counts = new Map<string, number>();
      for (const seat of (seatsResult.data ?? []) as Array<{ venue_zone_id: string }>) {
        counts.set(seat.venue_zone_id, (counts.get(seat.venue_zone_id) ?? 0) + 1);
      }

      return ((zonesResult.data ?? []) as VenueZoneRow[]).map((zone) => ({
        id: zone.id,
        venueId: zone.venue_id,
        name: zone.name,
        description: zone.description,
        color: zone.color,
        rows: zone.rows,
        seatsPerRow: zone.seats_per_row,
        defaultPriceMinorUnits: zone.default_price_minor_units,
        capacity: counts.get(zone.id) ?? 0,
      }));
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
          is_home: input.isHome ?? false,
        })
        .select("*")
        .single();
      if (error) throw new Error(error.message);

      await recordAudit({
        action: AUDIT_ACTIONS.venueCreate,
        entity: "venues",
        entityId: data.id,
        metadata: {
          name: input.name.trim(),
          city: input.city?.trim() || null,
          is_home: input.isHome ?? false,
        },
      });

      return data;
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["admin-venues"] }),
  });
}

export function useUpdateVenue() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; patch: AdminVenueInput }) => {
      const { error } = await client()
        .from("venues")
        .update({
          name: input.patch.name.trim(),
          city: input.patch.city?.trim() || null,
          address: input.patch.address?.trim() || null,
          ...(input.patch.isHome === undefined ? {} : { is_home: input.patch.isHome }),
        })
        .eq("id", input.id);
      if (error) throw new Error(error.message);

      await recordAudit({
        action: AUDIT_ACTIONS.venueUpdate,
        entity: "venues",
        entityId: input.id,
        metadata: { name: input.patch.name.trim(), fields: Object.keys(input.patch) },
      });

      return input.id;
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["admin-venues"] }),
  });
}

export function useSaveVenueZone() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      venueId: string;
      zoneId?: string;
      patch: VenueZoneInput;
    }) => {
      const { data, error } = await client().rpc("admin_save_venue_zone", {
        p_zone_id: input.zoneId ?? "",
        p_venue_id: input.venueId,
        p_patch: {
          name: input.patch.name,
          description: input.patch.description,
          color: input.patch.color,
          rows: input.patch.rows,
          seatsPerRow: input.patch.seatsPerRow,
          defaultPriceMinorUnits: input.patch.defaultPriceMinorUnits,
        },
      });
      if (error) throw new Error(error.message);
      return data;
    },
    onSuccess: (_data, input) => {
      void queryClient.invalidateQueries({ queryKey: ["admin-venue-layout", input.venueId] });
      void queryClient.invalidateQueries({ queryKey: ["admin-venues"] });
    },
  });
}

export function useDeleteVenueZone() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { venueId: string; zoneId: string }) => {
      const { error } = await client().rpc("admin_delete_venue_zone", {
        p_zone_id: input.zoneId ?? "",
      });
      if (error) throw new Error(error.message);
      return input.zoneId;
    },
    onSuccess: (_data, input) => {
      void queryClient.invalidateQueries({ queryKey: ["admin-venue-layout", input.venueId] });
      void queryClient.invalidateQueries({ queryKey: ["admin-venues"] });
    },
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
