"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

export interface AdminGate {
  id: string;
  name: string;
  matchId: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  matchLabel: string | null;
  kickoffAt: string | null;
  matchStatus: string | null;
}

export interface AdminGateInput {
  id: string;
  name: string;
  matchId: string | null;
  active: boolean;
}

interface GateRow {
  id: string;
  name: string;
  match_id: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
  matches: { opponent: string; kickoff_at: string; status: string } | null;
}

const SELECT = "id,name,match_id,active,created_at,updated_at,matches(opponent,kickoff_at,status)";

function client() {
  return createClient();
}

function mapGate(row: GateRow): AdminGate {
  return {
    id: row.id,
    name: row.name,
    matchId: row.match_id,
    active: row.active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    matchLabel: row.matches ? `XClub vs ${row.matches.opponent}` : null,
    kickoffAt: row.matches?.kickoff_at ?? null,
    matchStatus: row.matches?.status ?? null,
  };
}

export function useGates() {
  return useQuery({
    queryKey: ["admin-gates"],
    queryFn: async () => {
      const { data, error } = await client().from("gates").select(SELECT).order("id");
      if (error) throw new Error(error.message);
      return ((data ?? []) as unknown as GateRow[]).map(mapGate);
    },
  });
}

export function useCreateGate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: AdminGateInput) => {
      const { data, error } = await client()
        .from("gates")
        .insert({
          id: input.id,
          name: input.name,
          match_id: input.matchId,
          active: input.active,
        })
        .select(SELECT)
        .single();
      if (error) throw new Error(error.message);
      return mapGate(data as unknown as GateRow);
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
      const patch: { name?: string; match_id?: string | null; active?: boolean } = {};
      if (input.patch.name !== undefined) patch.name = input.patch.name;
      if (input.patch.matchId !== undefined) patch.match_id = input.patch.matchId;
      if (input.patch.active !== undefined) patch.active = input.patch.active;

      const { data, error } = await client()
        .from("gates")
        .update(patch)
        .eq("id", input.id)
        .select(SELECT)
        .single();
      if (error) throw new Error(error.message);
      return mapGate(data as unknown as GateRow);
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
      return id;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin-gates"] });
    },
  });
}
