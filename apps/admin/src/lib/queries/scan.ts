"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";
import type { ScanResultCode } from "@kickoff/shared";
import { listQueue, type QueuedScan } from "@/lib/offline-queue";
import {
  getDemoPass,
  scanTicket,
  syncQueuedScans,
  undoScan,
  type DemoPass,
  type ReplayReport,
  type ScanOutcome,
} from "@/lib/scan-api";
import { createClient } from "@/lib/supabase/client";

export interface ScanStats {
  total: number;
  valid: number;
  used: number;
  invalid: number;
  wrongMatch: number;
}

export interface RecentScan {
  id: string;
  result: ScanResultCode;
  gateId: string;
  createdAt: string;
  undoneAt: string | null;
  ticketId: string | null;
  holder: string;
  matchLabel: string;
  zoneName: string;
  seatLabel: string;
}

interface ScanEventRow {
  id: string;
  result: string;
  gate_id: string;
  created_at: string;
  undone_at: string | null;
  tickets: {
    id: string;
    user_id: string;
    matches: { opponent: string } | null;
    seats: { row_label: string; number: number; zones: { name: string } | null } | null;
  } | null;
}

const RESULT_CODES: readonly ScanResultCode[] = ["valid", "used", "invalid", "wrong_match"];

const SCAN_EVENT_SELECT =
  "id,result,gate_id,created_at,undone_at,tickets(id,user_id,matches(opponent),seats(row_label,number,zones(name)))";

async function loadHolders(userIds: string[]): Promise<Record<string, string>> {
  const unique = [...new Set(userIds.filter(Boolean))];
  if (unique.length === 0) return {};
  const { data, error } = await createClient()
    .from("profiles")
    .select("id,full_name,email")
    .in("id", unique);
  if (error) throw new Error(error.message);
  return Object.fromEntries(
    ((data ?? []) as Array<{ id: string; full_name: string; email: string }>).map((profile) => [
      profile.id,
      profile.full_name || profile.email,
    ]),
  );
}

function invalidateAfterScan(queryClient: ReturnType<typeof useQueryClient>) {
  void queryClient.invalidateQueries({ queryKey: ["scan-events"] });
  void queryClient.invalidateQueries({ queryKey: ["scan-stats"] });
  void queryClient.invalidateQueries({ queryKey: ["scan-demo"] });
  void queryClient.invalidateQueries({ queryKey: ["admin-orders"] });
  void queryClient.invalidateQueries({ queryKey: ["tickets"] });
}

export function useScan(gateId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation<ScanOutcome, Error, { qr: string }>({
    mutationFn: async ({ qr }) => {
      if (!gateId) throw new Error("Select a gate before scanning");
      return scanTicket(qr, gateId);
    },
    onSuccess: () => invalidateAfterScan(queryClient),
  });
}

export function useUndoScan(gateId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (scanEventId: string) => {
      if (!gateId) throw new Error("Select a gate before undoing a scan");
      return undoScan(scanEventId, gateId);
    },
    onSuccess: () => invalidateAfterScan(queryClient),
  });
}

export function useScanDemo(gateId: string | undefined) {
  return useQuery<DemoPass>({
    queryKey: ["scan-demo", gateId],
    enabled: Boolean(gateId),
    staleTime: 0,
    retry: false,
    queryFn: () => getDemoPass(gateId!),
  });
}

export function useScanEvents(input: { gateId?: string; limit?: number } = {}) {
  const { gateId, limit = 8 } = input;
  return useQuery({
    queryKey: ["scan-events", gateId ?? "all", limit],
    queryFn: async () => {
      let query = createClient()
        .from("scan_events")
        .select(SCAN_EVENT_SELECT)
        .order("created_at", { ascending: false })
        .limit(limit);
      if (gateId) query = query.eq("gate_id", gateId);
      const { data, error } = await query;
      if (error) throw new Error(error.message);

      const rows = (data ?? []) as unknown as ScanEventRow[];
      const holders = await loadHolders(rows.map((row) => row.tickets?.user_id ?? ""));

      return rows.map((row): RecentScan => {
        const seat = row.tickets?.seats;
        const rowLabel = seat?.row_label ?? "";
        return {
          id: row.id,
          result: RESULT_CODES.includes(row.result as ScanResultCode)
            ? (row.result as ScanResultCode)
            : "invalid",
          gateId: row.gate_id,
          createdAt: row.created_at,
          undoneAt: row.undone_at,
          ticketId: row.tickets?.id ?? null,
          holder: holders[row.tickets?.user_id ?? ""] || "Unknown pass",
          matchLabel: `KickOff vs ${row.tickets?.matches?.opponent ?? "opponent"}`,
          zoneName: seat?.zones?.name ?? "",
          seatLabel: `${rowLabel}${seat?.number ?? ""}`,
        };
      });
    },
  });
}

export function useScanStats(range?: { from: string; to: string }) {
  return useQuery<ScanStats>({
    queryKey: ["scan-stats", range],
    queryFn: async () => {
      const client = createClient();
      let query = client.from("scan_events").select("result");
      if (range) query = query.gte("created_at", range.from).lte("created_at", range.to);
      const { data, error } = await query;
      if (error) throw new Error(error.message);

      const counts: ScanStats = { total: 0, valid: 0, used: 0, invalid: 0, wrongMatch: 0 };
      for (const row of data ?? []) {
        counts.total += 1;
        if (row.result === "valid") counts.valid += 1;
        else if (row.result === "used") counts.used += 1;
        else if (row.result === "wrong_match") counts.wrongMatch += 1;
        else counts.invalid += 1;
      }
      return counts;
    },
  });
}

export interface OrderScanUsage {
  used: number;
  lastScanAt: string | null;
}

interface UsageRow {
  id: string;
  created_at: string;
  tickets: { order_id: string } | null;
}

/**
 * Counts accepted (not undone) scan events per order for the current page.
 * P8-09: the "used" badge comes from server scan_events, not local state.
 */
export function useOrderScanUsage(orderIds: string[]) {
  const sorted = [...orderIds].sort();
  return useQuery({
    queryKey: ["order-scan-usage", sorted],
    enabled: sorted.length > 0,
    queryFn: async () => {
      const { data, error } = await createClient()
        .from("scan_events")
        .select("id,created_at,tickets!inner(order_id)")
        .eq("result", "valid")
        .is("undone_at", null)
        .in("tickets.order_id", sorted);
      if (error) throw new Error(error.message);

      const usage: Record<string, OrderScanUsage> = {};
      for (const row of (data ?? []) as unknown as UsageRow[]) {
        const orderId = row.tickets?.order_id;
        if (!orderId) continue;
        const current = usage[orderId] ?? { used: 0, lastScanAt: null };
        current.used += 1;
        if (!current.lastScanAt || row.created_at > current.lastScanAt) {
          current.lastScanAt = row.created_at;
        }
        usage[orderId] = current;
      }
      return usage;
    },
  });
}

/** Offline queue size plus a manual replay trigger. */
export function useOfflineQueue() {
  const [queue, setQueue] = useState<QueuedScan[]>(() =>
    typeof window === "undefined" ? [] : listQueue(),
  );
  const [syncing, setSyncing] = useState(false);

  const refresh = useCallback(() => {
    setQueue(listQueue());
  }, []);

  const sync = useCallback(async (): Promise<ReplayReport> => {
    setSyncing(true);
    try {
      const report = await syncQueuedScans();
      setQueue(listQueue());
      return report;
    } finally {
      setSyncing(false);
    }
  }, []);

  useEffect(() => {
    const onStorage = () => refresh();
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [refresh]);

  return { queue, count: queue.length, syncing, sync, refresh };
}
