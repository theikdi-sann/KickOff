"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  requireDefined,
  toMatchDto,
  toZoneAvailabilityDto,
  toZoneDto,
  type ZoneAvailabilityDto,
} from "@kickoff/shared";
import { AUDIT_ACTIONS, changedFields, recordAudit, recordReschedule } from "@/lib/audit";
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
  priceSatang: number;
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
      const { data, error } = await client()
        .from("zones")
        .select("*")
        .order("price_satang", { ascending: true });
      if (error) throw new Error(error.message);
      return (data ?? []).map(toZoneDto);
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
  revenueSatang: number;
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
            revenueSatang: row.revenue_satang ?? 0,
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
      const { data, error } = await client()
        .from("zones")
        .select("*")
        .eq("match_id", requireDefined(matchId, "match id"))
        .order("price_satang", { ascending: true });
      if (error) throw new Error(error.message);
      return (data ?? []).map(toZoneDto);
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
      // RS-8: a reason rides along only when the kickoff changed (the form
      // guarantees it) — read the old kickoff first so the audit row has `from`.
      const rescheduleReason = input.patch.reason;
      const rescheduled = rescheduleReason !== undefined && input.patch.kickoffAt !== undefined;
      let previousKickoffAt: string | null = null;
      if (rescheduled) {
        const { data: before, error: beforeError } = await client()
          .from("matches")
          .select("kickoff_at")
          .eq("id", input.id)
          .single();
        if (beforeError) throw new Error(beforeError.message);
        previousKickoffAt = before.kickoff_at;
      }

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

      const { data, error } = await client()
        .from("matches")
        .update(patch)
        .eq("id", input.id)
        .select("*, venues(name)")
        .single();
      if (error) throw new Error(error.message);

      // Every privileged change is recorded: what changed, on which fixture.
      await recordAudit({
        action: AUDIT_ACTIONS.matchUpdate,
        entity: "matches",
        entityId: input.id,
        metadata: { fields: changedFields(patch) },
      });

      if (rescheduled) {
        // The kickoff moved: store {from, to, reason} in audit_logs (RS-8).
        await recordReschedule({
          matchId: input.id,
          from: previousKickoffAt ?? requireDefined(input.patch.kickoffAt, "kickoff time"),
          to: requireDefined(input.patch.kickoffAt, "kickoff time"),
          reason: requireDefined(rescheduleReason, "reschedule reason"),
        });
      }
      return toMatchDto(data);
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
      const patch: { name?: string; description?: string; price_satang?: number; color?: string } = {};
      if (input.patch.name !== undefined) patch.name = input.patch.name;
      if (input.patch.description !== undefined) patch.description = input.patch.description;
      if (input.patch.priceSatang !== undefined) patch.price_satang = input.patch.priceSatang;
      if (input.patch.color !== undefined) patch.color = input.patch.color;

      const { data, error } = await client()
        .from("zones")
        .update(patch)
        .eq("id", input.id)
        .select("*")
        .single();
      if (error) throw new Error(error.message);

      await recordAudit({
        action: AUDIT_ACTIONS.zoneUpdate,
        entity: "zones",
        entityId: input.id,
        metadata: { fields: changedFields(patch), match_id: input.matchId },
      });

      return toZoneDto(data);
    },
    onSuccess: (zone) => invalidateMatchData(queryClient, zone.matchId),
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
          price_satang: input.priceSatang,
          color: input.color,
          rows: input.rows,
          seats_per_row: input.seatsPerRow,
        })
        .select("*")
        .single();
      if (error) throw new Error(error.message);

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
          price_satang: input.priceSatang,
          rows: input.rows.length,
          seats_per_row: input.seatsPerRow,
          seats_created: seats.length,
        },
      });

      return toZoneDto(zone);
    },
    onSuccess: (zone) => invalidateMatchData(queryClient, zone.matchId),
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
