"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AUDIT_ACTIONS, changedFields, recordAudit } from "@/lib/audit";
import { createClient } from "@/lib/supabase/client";

/**
 * A gate is a physical turnstile bound to a venue; the fixtures it admits are
 * `match_gates` rows (0044), so one gate can serve several matchdays.
 *
 * PostgREST can embed a parent from a child (`match_gates → matches`), but the
 * assignment is read on its own and joined here — the same two-query shape the
 * zone prices use, because the generated types only carry outgoing foreign
 * keys.
 */
export interface AdminGate {
  id: string;
  name: string;
  venueId: string;
  venueName: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  /** Assigned fixture ids, ordered by kick-off. */
  matchIds: string[];
  /** `KickOff vs <opponent>` per assigned fixture, ordered by kick-off. */
  matchLabels: string[];
  /** Kick-off of the earliest assigned fixture — the single-fixture view. */
  kickoffAt: string | null;
}

export interface AdminGateInput {
  id: string;
  name: string;
  venueId: string;
  matchIds: string[];
  active: boolean;
}

interface GateRow {
  id: string;
  name: string;
  venue_id: string;
  active: boolean;
  created_at: string;
  updated_at: string;
  venues: { name: string } | null;
}

interface AssignmentRow {
  gate_id: string;
  match_id: string;
  matches: { opponent: string; kickoff_at: string } | null;
}

const GATE_SELECT = "id,name,venue_id,active,created_at,updated_at,venues(name)";
const ASSIGNMENT_SELECT = "gate_id,match_id,matches(opponent,kickoff_at)";

function client() {
  return createClient();
}

function mapGate(row: GateRow): AdminGate {
  return {
    id: row.id,
    name: row.name,
    venueId: row.venue_id,
    venueName: row.venues?.name ?? null,
    active: row.active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    matchIds: [],
    matchLabels: [],
    kickoffAt: null,
  };
}

/** Gates with their assignments, fixtures ordered by kick-off. */
async function loadGates(): Promise<AdminGate[]> {
  const db = client();
  const [gates, assignments] = await Promise.all([
    db.from("gates").select(GATE_SELECT).order("id"),
    db.from("match_gates").select(ASSIGNMENT_SELECT),
  ]);
  if (gates.error) throw new Error(gates.error.message);
  if (assignments.error) throw new Error(assignments.error.message);

  const byGate = new Map<string, AdminGate>();
  for (const row of (gates.data ?? []) as unknown as GateRow[]) {
    byGate.set(row.id, mapGate(row));
  }

  const labelsByGate = new Map<string, Array<{ id: string; label: string; kickoffAt: string }>>();
  for (const row of (assignments.data ?? []) as unknown as AssignmentRow[]) {
    const gate = byGate.get(row.gate_id);
    if (!gate) continue;
    const bucket = labelsByGate.get(row.gate_id) ?? [];
    bucket.push({
      id: row.match_id,
      label: row.matches ? `KickOff vs ${row.matches.opponent}` : "Unknown fixture",
      kickoffAt: row.matches?.kickoff_at ?? "",
    });
    labelsByGate.set(row.gate_id, bucket);
  }

  for (const [gateId, fixtures] of labelsByGate) {
    const gate = byGate.get(gateId);
    if (!gate) continue;
    fixtures.sort((a, b) => a.kickoffAt.localeCompare(b.kickoffAt));
    gate.matchIds = fixtures.map((fixture) => fixture.id);
    gate.matchLabels = fixtures.map((fixture) => fixture.label);
    gate.kickoffAt = fixtures.find((fixture) => fixture.kickoffAt)?.kickoffAt ?? null;
  }

  return [...byGate.values()];
}

export function useGates() {
  return useQuery({
    queryKey: ["admin-gates"],
    queryFn: loadGates,
  });
}

export function useCreateGate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: AdminGateInput) => {
      const db = client();
      const { error } = await db.from("gates").insert({
        id: input.id,
        name: input.name,
        venue_id: input.venueId,
        active: input.active,
      });
      if (error) throw new Error(error.message);

      if (input.matchIds.length > 0) {
        const { error: assignmentError } = await db.from("match_gates").insert(
          input.matchIds.map((matchId) => ({ match_id: matchId, gate_id: input.id })),
        );
        if (assignmentError) throw new Error(assignmentError.message);
      }

      await recordAudit({
        action: AUDIT_ACTIONS.gateCreate,
        entity: "gates",
        entityId: input.id,
        metadata: {
          name: input.name,
          venue_id: input.venueId,
          match_ids: input.matchIds,
          active: input.active,
        },
      });

      return input.id;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin-gates"] });
    },
  });
}

export function useUpdateGate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; patch: Partial<Omit<AdminGateInput, "id">> }) => {
      const db = client();
      const patch: { name?: string; venue_id?: string; active?: boolean } = {};
      if (input.patch.name !== undefined) patch.name = input.patch.name;
      if (input.patch.venueId !== undefined) patch.venue_id = input.patch.venueId;
      if (input.patch.active !== undefined) patch.active = input.patch.active;

      if (Object.keys(patch).length > 0) {
        const { error } = await db
          .from("gates")
          .update(patch)
          .eq("id", input.id)
          .select(GATE_SELECT)
          .single();
        if (error) throw new Error(error.message);
      }

      // `matchIds` is the full desired set: diff it against what the join
      // holds so an unchanged assignment costs no writes.
      let assignmentsChanged = false;
      if (input.patch.matchIds !== undefined) {
        const { data: current, error: readError } = await db
          .from("match_gates")
          .select("match_id")
          .eq("gate_id", input.id);
        if (readError) throw new Error(readError.message);

        const currentIds = ((current ?? []) as Array<{ match_id: string }>).map(
          (row) => row.match_id,
        );
        const removed = currentIds.filter((id) => !input.patch.matchIds?.includes(id));
        const added = input.patch.matchIds.filter((id) => !currentIds.includes(id));

        if (removed.length > 0) {
          const { error: removeError } = await db
            .from("match_gates")
            .delete()
            .eq("gate_id", input.id)
            .in("match_id", removed);
          if (removeError) throw new Error(removeError.message);
        }
        if (added.length > 0) {
          const { error: addError } = await db
            .from("match_gates")
            .insert(added.map((matchId) => ({ match_id: matchId, gate_id: input.id })));
          if (addError) throw new Error(addError.message);
        }
        assignmentsChanged = removed.length > 0 || added.length > 0;
      }

      await recordAudit({
        action: AUDIT_ACTIONS.gateUpdate,
        entity: "gates",
        entityId: input.id,
        metadata: {
          fields: changedFields(patch),
          ...(assignmentsChanged ? { match_ids: input.patch.matchIds } : {}),
        },
      });

      return input.id;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin-gates"] });
      void queryClient.invalidateQueries({ queryKey: ["scan-demo"] });
    },
  });
}

export function useDeleteGate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await client().from("gates").delete().eq("id", id);
      if (error) {
        if (error.code === "23503") {
          throw new Error(
            "This gate already has scan history. Deactivate it instead of deleting it.",
          );
        }
        throw new Error(error.message);
      }

      await recordAudit({
        action: AUDIT_ACTIONS.gateDelete,
        entity: "gates",
        entityId: id,
      });

      return id;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin-gates"] });
    },
  });
}
