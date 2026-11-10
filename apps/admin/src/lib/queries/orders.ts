"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { OrderDto, OrderStatus } from "@kickoff/shared";
import { invokeFunction } from "@/lib/functions";
import { createClient } from "@/lib/supabase/client";

interface AdminOrderRow {
  id: string;
  user_id: string;
  match_id: string;
  amount_satang: number;
  status: string;
  created_at: string;
  paid_at: string | null;
  payment_ref: string | null;
  matches: { opponent: string } | null;
  order_seats: Array<{
    seat_id: string;
    ticket_id: string | null;
    zone_name: string;
    row_label: string;
    number: number;
    price_satang: number;
  }>;
}

export interface AdminOrder extends OrderDto {
  holderName: string;
  holderEmail: string;
}

const STATUSES: readonly OrderStatus[] = ["pending", "paid", "failed", "cancelled", "refunded"];
const SELECT =
  "*, matches(opponent), order_seats(seat_id,ticket_id,zone_name,row_label,number,price_satang)";

interface Holder {
  full_name: string;
  email: string;
}

// profiles.id references auth.users (not orders), so PostgREST cannot embed it.
async function loadHolders(userIds: string[]): Promise<Record<string, Holder>> {
  const unique = [...new Set(userIds.filter(Boolean))];
  if (unique.length === 0) return {};
  const { data, error } = await createClient()
    .from("profiles")
    .select("id,full_name,email")
    .in("id", unique);
  if (error) throw new Error(error.message);
  return Object.fromEntries(
    ((data ?? []) as Array<{ id: string } & Holder>).map((profile) => [profile.id, profile]),
  );
}

function mapOrder(row: AdminOrderRow, holder?: Holder): AdminOrder {
  return {
    id: row.id,
    userId: row.user_id,
    matchId: row.match_id,
    matchLabel: `KickOff vs ${row.matches?.opponent ?? "opponent"}`,
    seats: (row.order_seats ?? []).map((seat) => ({
      seatId: seat.seat_id,
      ticketId: seat.ticket_id,
      zoneId: "",
      zoneName: seat.zone_name,
      row: seat.row_label,
      number: seat.number,
      priceSatang: seat.price_satang,
    })),
    amountSatang: row.amount_satang,
    status: STATUSES.includes(row.status as OrderStatus)
      ? (row.status as OrderStatus)
      : "pending",
    createdAt: row.created_at,
    paidAt: row.paid_at,
    paymentRef: row.payment_ref,
    holderName: holder?.full_name ?? "",
    holderEmail: holder?.email ?? "",
  };
}

export interface OrdersFilter {
  search?: string;
  status?: OrderStatus | "all";
  page: number;
  perPage: number;
}

export function useOrders(filter: OrdersFilter) {
  return useQuery({
    queryKey: ["admin-orders", filter],
    queryFn: async (): Promise<{ items: AdminOrder[]; total: number }> => {
      const from = (filter.page - 1) * filter.perPage;
      let query = createClient()
        .from("orders")
        .select(SELECT, { count: "exact" })
        .order("created_at", { ascending: false })
        .range(from, from + filter.perPage - 1);

      if (filter.status && filter.status !== "all") query = query.eq("status", filter.status);
      if (filter.search && filter.search.trim().length > 0) {
        const term = filter.search.trim().replace(/[%,]/g, "");
        query = query.or(`id.ilike.%${term}%,payment_ref.ilike.%${term}%`);
      }

      const { data, count, error } = await query;
      if (error) throw new Error(error.message);
      const rows = (data ?? []) as unknown as AdminOrderRow[];
      const holders = await loadHolders(rows.map((row) => row.user_id));
      return {
        items: rows.map((row) => mapOrder(row, holders[row.user_id])),
        total: count ?? 0,
      };
    },
  });
}

export function useOrder(id: string | undefined) {
  return useQuery({
    queryKey: ["admin-order", id],
    enabled: Boolean(id),
    queryFn: async () => {
      const { data, error } = await createClient()
        .from("orders")
        .select(SELECT)
        .eq("id", id!)
        .single();
      if (error) throw new Error(error.message);
      const row = data as unknown as AdminOrderRow;
      const holders = await loadHolders([row.user_id]);
      return mapOrder(row, holders[row.user_id]);
    },
  });
}

export function useRefund() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      orderId: string;
      reason?: string;
      overrideUsedTickets?: boolean;
    }) =>
      invokeFunction<{ refunded: boolean; refundId?: string; alreadyRefunded: boolean }>(
        "refund-order",
        { method: "POST", body: input },
      ),
    onSuccess: (_result, input) => {
      void queryClient.invalidateQueries({ queryKey: ["admin-orders"] });
      void queryClient.invalidateQueries({ queryKey: ["admin-order", input.orderId] });
    },
  });
}

export interface OrdersAggregate {
  range: { from: string; to: string };
  revenueSatang: number;
  ordersPaid: number;
  ordersRefunded: number;
  ticketsSold: number;
  scans: { total: number; valid: number; used: number; invalid: number; wrongMatch: number };
}

export function useOrdersAggregate(range?: { from: string; to: string }) {
  return useQuery({
    queryKey: ["orders-aggregate", range],
    queryFn: () =>
      invokeFunction<OrdersAggregate>("orders-aggregate", {
        method: "POST",
        body: range ? { from: range.from, to: range.to } : {},
      }),
  });
}

// Scan stats moved to `./scan.ts` (P8-06); re-exported for existing callers.
export { useScanStats } from "./scan";
export type { ScanStats } from "./scan";
