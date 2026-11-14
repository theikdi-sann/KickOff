"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  requireDefined,
  toMatchDto,
  toZoneAvailabilityDto,
  zoneDtosWithPrices,
  type MatchRow,
  type ZoneAvailabilityDto,
} from "@kickoff/shared";
import { AUDIT_ACTIONS, changedFields, recordAudit } from "@/lib/audit";
import { createClient } from "@/lib/supabase/client";

export interface AdminMatchInput {
  opponent: string;
  opponentShort: string;
  kickoffAt: string;
  venue: string;
  competition: string;
  homeAway: "home" | "away";
  posterColors: [string, string];
  accent: string;
  /** Reschedule justification (1–400) — present iff the kickoff changed. */
  reason?: string;
}

export interface AdminZoneInput {
  name: string;
  description: string;
  priceMinorUnits: number;
  color: string;
  rows: string[];
  seatsPerRow: number;
}

function client() {
  return createClient();
}

/**
 * Resolves a venue *name* (what the form edits) to its id, creating the row
 * if it does not exist yet — the admin select only offers existing venues,
 * but a stale tab may still submit a name that was deleted meanwhile.
 */
async function resolveVenueId(name: string): Promise<string> {
  const db = client();
  const { data: existing, error: lookupError } = await db
    .from("venues")
    .select("id")
    .eq("name", name)
    .maybeSingle();
  if (lookupError) throw new Error(lookupError.message);
  if (existing) return existing.id;

  const { data: created, error: createError } = await db
    .from("venues")
    .upsert({ name }, { onConflict: "name", ignoreDuplicates: true })
    .select("id")
    .maybeSingle();
  if (createError) throw new Error(createError.message);
  if (created) return created.id;

  // Lost the insert race — the row exists now, read it back.
  const { data: raced, error: racedError } = await db
    .from("venues")
    .select("id")
    .eq("name", name)
    .single();
  if (racedError) throw new Error(racedError.message);
  return raced.id;
}

export function useMatches() {
  return useQuery({
    queryKey: ["admin-matches"],
    queryFn: async () => {
      const { data, error } = await client()
        .from("matches")
        .select("*, venues(name)")
        .order("kickoff_at", { ascending: true });
      if (error) throw new Error(error.message);
      return (data ?? []).map(toMatchDto);
    },
  });
}

export function useMatch(id: string | undefined) {
  return useQuery({
    queryKey: ["admin-match", id],
    enabled: Boolean(id),
    queryFn: async () => {
      const { data, error } = await client()
        .from("matches")
        .select("*, venues(name)")
        .eq("id", requireDefined(id, "match id"))
        .single();
      if (error) throw new Error(error.message);
      return toMatchDto(data);
    },
  });
}

export function useAllZones() {
  return useQuery({
    queryKey: ["admin-zones-all"],
    queryFn: async () => {
      const [zones, prices] = await Promise.all([
        client().from("zones").select("*"),
        client().from("match_zone_prices").select("zone_id, price_minor_units"),
      ]);
      if (zones.error) throw new Error(zones.error.message);
      if (prices.error) throw new Error(prices.error.message);
      return zoneDtosWithPrices(zones.data ?? [], prices.data ?? []);
    },
  });
}

/**
 * The availability of every zone, from the authoritative view.
 *
 * `public.zone_availability` counts the seats that exist and the ones that
 * are free right now — a seat reserved by a pending order is not available.
 * The zone layout (`rows.length * seatsPerRow`) is what the club asked for,
 * so computing sell-through from it in the browser could disagree with the
 * database.
 */
export function useZoneAvailability() {
  return useQuery({
    queryKey: ["admin-zone-availability"],
    queryFn: async (): Promise<ZoneAvailabilityDto[]> => {
      const { data, error } = await client()
        .from("zone_availability")
        .select("zone_id,total_seats,available_seats,zones(match_id)");
      if (error) throw new Error(error.message);

      return (data ?? [])
        .map((row) =>
          toZoneAvailabilityDto({
            zone_id: row.zone_id,
            total_seats: row.total_seats,
            available_seats: row.available_seats,
            zones: row.zones,
          }),
        )
        .filter((zone): zone is ZoneAvailabilityDto => zone !== null);
    },
  });
}

export interface MatchSalesSummary {
  matchId: string;
  ordersPaid: number;
  revenueMinorUnits: number;
  ticketsSold: number;
}

export function useMatchSalesSummaries() {
  return useQuery({
    queryKey: ["admin-match-sales"],
    queryFn: async (): Promise<Record<string, MatchSalesSummary>> => {
      const { data, error } = await client().from("match_sales_summary").select("*");
      if (error) throw new Error(error.message);
      return Object.fromEntries(
        (data ?? []).map((row) => [
          row.match_id,
          {
            matchId: row.match_id,
            ordersPaid: row.orders_paid ?? 0,
            revenueMinorUnits: row.revenue_minor_units ?? 0,
            ticketsSold: row.tickets_sold ?? 0,
          },
        ]),
      );
    },
  });
}

export function useZones(matchId: string | undefined) {
  return useQuery({
    queryKey: ["admin-zones", matchId],
    enabled: Boolean(matchId),
    queryFn: async () => {
      const match = requireDefined(matchId, "match id");
      const [zones, prices] = await Promise.all([
        client().from("zones").select("*").eq("match_id", match),
        client()
          .from("match_zone_prices")
          .select("zone_id, price_minor_units")
          .eq("match_id", match),
      ]);
      if (zones.error) throw new Error(zones.error.message);
      if (prices.error) throw new Error(prices.error.message);
      return zoneDtosWithPrices(zones.data ?? [], prices.data ?? []);
    },
  });
}

function invalidateMatchData(queryClient: ReturnType<typeof useQueryClient>, matchId?: string) {
  void queryClient.invalidateQueries({ queryKey: ["admin-matches"] });
  void queryClient.invalidateQueries({ queryKey: ["admin-zones-all"] });
  void queryClient.invalidateQueries({ queryKey: ["admin-match-sales"] });
  // A zone change moves the seats, so the availability counts move with it.
  void queryClient.invalidateQueries({ queryKey: ["admin-zone-availability"] });
  if (matchId) {
    void queryClient.invalidateQueries({ queryKey: ["admin-match", matchId] });
    void queryClient.invalidateQueries({ queryKey: ["admin-zones", matchId] });
  }
}

export function useCreateMatch() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: AdminMatchInput) => {
      const venueId = await resolveVenueId(input.venue);
      const { data, error } = await client()
        .from("matches")
        .insert({
          opponent: input.opponent,
          opponent_short: input.opponentShort,
          kickoff_at: input.kickoffAt,
          venue_id: venueId,
          competition: input.competition,
          home_away: input.homeAway,
          poster_colors: input.posterColors,
          accent: input.accent,
        })
        .select("*, venues(name)")
        .single();
      if (error) throw new Error(error.message);

      await recordAudit({
        action: AUDIT_ACTIONS.matchCreate,
        entity: "matches",
        entityId: data.id,
        metadata: {
          opponent: input.opponent,
          competition: input.competition,
          kickoff_at: input.kickoffAt,
          venue_id: venueId,
        },
      });

      return toMatchDto(data);
    },
    onSuccess: () => invalidateMatchData(queryClient),
  });
}

export function useUpdateMatch() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; patch: Partial<AdminMatchInput> }) => {
      const patch: {
        opponent?: string;
        opponent_short?: string;
        kickoff_at?: string;
        venue_id?: string;
        competition?: string;
        home_away?: string;
        poster_colors?: string[];
        accent?: string;
      } = {};
      if (input.patch.opponent !== undefined) patch.opponent = input.patch.opponent;
      if (input.patch.opponentShort !== undefined) patch.opponent_short = input.patch.opponentShort;
      if (input.patch.kickoffAt !== undefined) patch.kickoff_at = input.patch.kickoffAt;
      if (input.patch.venue !== undefined) patch.venue_id = await resolveVenueId(input.patch.venue);
      if (input.patch.competition !== undefined) patch.competition = input.patch.competition;
      if (input.patch.homeAway !== undefined) patch.home_away = input.patch.homeAway;
      if (input.patch.posterColors !== undefined) patch.poster_colors = input.patch.posterColors;
      if (input.patch.accent !== undefined) patch.accent = input.patch.accent;

      // F-07: the kickoff change and its {from, to, reason} audit row are
      // written by ONE database call, so a failure can no longer leave a
      // moved fixture with no record of why. A reason is required by the
      // database itself when the kickoff moves (the form demands it too).
      const { data, error } = await client().rpc("admin_update_match", {
        p_match_id: input.id,
        p_patch: patch,
        p_reason: input.patch.reason ?? undefined,
      });
      if (error) throw new Error(error.message);

      // The fields row is written from the console like every other
      // privileged change (documented limitation — GAP-04).
      await recordAudit({
        action: AUDIT_ACTIONS.matchUpdate,
        entity: "matches",
        entityId: input.id,
        metadata: { fields: changedFields(patch) },
      });

      const result = requireDefined(data, "updated fixture") as unknown as {
        row: MatchRow;
        venue_name: string;
        rescheduled: boolean;
      };
      return toMatchDto({
        ...result.row,
        venues: { name: result.venue_name },
      });
    },
    onSuccess: (match) => invalidateMatchData(queryClient, match.id),
  });
}

export function useDeleteMatch() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await client().from("matches").delete().eq("id", id);
      if (error) throw new Error(error.message);

      await recordAudit({
        action: AUDIT_ACTIONS.matchDelete,
        entity: "matches",
        entityId: id,
      });

      return id;
    },
    onSuccess: () => invalidateMatchData(queryClient),
  });
}

export function useUpdateZone() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      id: string;
      matchId: string;
      patch: Partial<Omit<AdminZoneInput, "rows" | "seatsPerRow">>;
    }) => {
      const zonePatch: { name?: string; description?: string; color?: string } = {};
      if (input.patch.name !== undefined) zonePatch.name = input.patch.name;
      if (input.patch.description !== undefined) zonePatch.description = input.patch.description;
      if (input.patch.color !== undefined) zonePatch.color = input.patch.color;

      const hasZonePatch = Object.keys(zonePatch).length > 0;
      if (hasZonePatch) {
        const { error } = await client()
          .from("zones")
          .update(zonePatch)
          .eq("id", input.id);
        if (error) throw new Error(error.message);
      }

      const changed = Object.keys(zonePatch);
      // The price is a row of its own: editing it never touches the zone.
      if (input.patch.priceMinorUnits !== undefined) {
        const { error } = await client().from("match_zone_prices").upsert({
          match_id: input.matchId,
          zone_id: input.id,
          price_minor_units: input.patch.priceMinorUnits,
        });
        if (error) throw new Error(error.message);
        changed.push("price_minor_units");
      }

      await recordAudit({
        action: AUDIT_ACTIONS.zoneUpdate,
        entity: "zones",
        entityId: input.id,
        metadata: { fields: changed.sort(), match_id: input.matchId },
      });

      return { matchId: input.matchId };
    },
    onSuccess: ({ matchId }) => invalidateMatchData(queryClient, matchId),
  });
}

export function useAddZone() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: AdminZoneInput & { matchId: string }) => {
      const { data: zone, error } = await client()
        .from("zones")
        .insert({
          match_id: input.matchId,
          name: input.name,
          description: input.description,
          color: input.color,
          rows: input.rows,
          seats_per_row: input.seatsPerRow,
        })
        .select("*")
        .single();
      if (error) throw new Error(error.message);

      // The price is a separate row keyed by (match, zone); without it the
      // zone is unpriced and `create_order_from_hold` refuses to sell it.
      const { error: priceError } = await client().from("match_zone_prices").insert({
        match_id: input.matchId,
        zone_id: zone.id,
        price_minor_units: input.priceMinorUnits,
      });
      if (priceError) {
        await rollbackZone(zone.id);
        throw new Error(
          `The zone could not be completed and was removed: ${priceError.message}`,
        );
      }

      const seats = input.rows.flatMap((row) =>
        Array.from({ length: input.seatsPerRow }, (_, index) => ({
          zone_id: zone.id,
          row_label: row,
          number: index + 1,
        })),
      );

      // PostgREST rejects an empty bulk insert, and a zone without seats would
      // still appear sellable in the UI. Roll the zone back on either failure.
      if (seats.length === 0) {
        await rollbackZone(zone.id);
        throw new Error("Add at least one row with one seat per row.");
      }

      const { error: seatError } = await client().from("seats").insert(seats);
      if (seatError) {
        await rollbackZone(zone.id);
        throw new Error(
          `The zone could not be completed and was removed: ${seatError.message}`,
        );
      }

      await recordAudit({
        action: AUDIT_ACTIONS.zoneCreate,
        entity: "zones",
        entityId: zone.id,
        metadata: {
          match_id: input.matchId,
          name: input.name,
          price_minor_units: input.priceMinorUnits,
          rows: input.rows.length,
          seats_per_row: input.seatsPerRow,
          seats_created: seats.length,
        },
      });

      return { matchId: input.matchId };
    },
    onSuccess: ({ matchId }) => invalidateMatchData(queryClient, matchId),
  });
}

/**
 * Removes a zone that could not be completed.
 *
 * The delete error is checked on purpose: an unchecked rollback leaves an
 * orphan zone that still looks sellable, while the operator was told it was
 * removed.
 */
async function rollbackZone(zoneId: string): Promise<void> {
  const { error } = await client().from("zones").delete().eq("id", zoneId);
  if (error) {
    throw new Error(
      `The zone could not be completed and could not be removed: ${error.message}. Ask an administrator to delete zone ${zoneId}.`,
    );
  }
}

export function useDeleteZone() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; matchId: string }) => {
      const { error } = await client().from("zones").delete().eq("id", input.id);
      if (error) throw new Error(error.message);

      await recordAudit({
        action: AUDIT_ACTIONS.zoneDelete,
        entity: "zones",
        entityId: input.id,
        metadata: { match_id: input.matchId },
      });

      return input;
    },
    onSuccess: (input) => invalidateMatchData(queryClient, input.matchId),
  });
}
