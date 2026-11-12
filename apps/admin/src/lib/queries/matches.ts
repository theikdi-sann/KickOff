"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toMatchDto, toZoneDto } from "@kickoff/shared";
import { recordReschedule } from "@/lib/audit";
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
        .eq("id", id!)
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
        .eq("match_id", matchId!)
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

      if (rescheduled) {
        // The kickoff moved: store {from, to, reason} in audit_logs (RS-8).
        await recordReschedule({
          matchId: input.id,
          from: previousKickoffAt ?? input.patch.kickoffAt!,
          to: input.patch.kickoffAt!,
          reason: rescheduleReason!,
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
        await client().from("zones").delete().eq("id", zone.id);
        throw new Error("Add at least one row with one seat per row.");
      }

      const { error: seatError } = await client().from("seats").insert(seats);
      if (seatError) {
        await client().from("zones").delete().eq("id", zone.id);
        throw new Error(
          `The zone could not be completed and was removed: ${seatError.message}`,
        );
      }

      return toZoneDto(zone);
    },
    onSuccess: (zone) => invalidateMatchData(queryClient, zone.matchId),
  });
}

export function useDeleteZone() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; matchId: string }) => {
      const { error } = await client().from("zones").delete().eq("id", input.id);
      if (error) throw new Error(error.message);
      return input;
    },
    onSuccess: (input) => invalidateMatchData(queryClient, input.matchId),
  });
}
