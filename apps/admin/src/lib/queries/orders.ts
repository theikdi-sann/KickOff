"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  paginationSchema,
  requireDefined,
  toOrderDto,
  type OrderDto,
  type OrderJoinRow,
  type OrderStatus,
  type PaginationParams,
} from "@kickoff/shared";
import { invokeFunction } from "@/lib/functions";
import { sanitizeSearchTerm } from "@/lib/search";
import { createClient } from "@/lib/supabase/client";

export interface AdminOrder extends OrderDto {
  holderName: string;
  holderEmail: string;
}

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

/**
 * The staff console shows the order plus the holder's identity, so it
 * projects the shared order DTO instead of mapping the row a second time.
 */
function toAdminOrder(row: OrderJoinRow, holder?: Holder): AdminOrder {
  return {
    ...toOrderDto(row),
    holderName: holder?.full_name ?? "",
    holderEmail: holder?.email ?? "",
  };
}

/**
 * The pager is the shared `paginationSchema`'s own shape: `page` and `perPage`
 * are validated (and defaulted) by the contract, so a list query can never be
 * asked for page 0 or 10,000 rows.
 */
export type OrdersFilter = PaginationParams & {
  search?: string;
  status?: OrderStatus | "all";
};

export function useOrders(filter: OrdersFilter) {
  return useQuery({
    queryKey: ["admin-orders", filter],
    queryFn: async (): Promise<{ items: AdminOrder[]; total: number }> => {
      // Validated at the edge of the query: a malformed pager is a programmer
      // error and must surface, not be silently clamped.
      const { page, perPage } = paginationSchema.parse(filter);
      const from = (page - 1) * perPage;
      let query = createClient()
        .from("orders")
        .select(SELECT, { count: "exact" })
        .order("created_at", { ascending: false })
        .range(from, from + perPage - 1);

      if (filter.status && filter.status !== "all") query = query.eq("status", filter.status);
      if (filter.search && filter.search.trim().length > 0) {
        const term = sanitizeSearchTerm(filter.search);
        if (term.length > 0) {
          query = query.or(`id.ilike.%${term}%,payment_ref.ilike.%${term}%`);
        }
      }

      const { data, count, error } = await query;
      if (error) throw new Error(error.message);
      const rows = (data ?? []) as unknown as OrderJoinRow[];
      const holders = await loadHolders(rows.map((row) => row.user_id));
      return {
        items: rows.map((row) => toAdminOrder(row, holders[row.user_id])),
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
        .eq("id", requireDefined(id, "order id"))
        .single();
      if (error) throw new Error(error.message);
      const row = data as unknown as OrderJoinRow;
      const holders = await loadHolders([row.user_id]);
      return toAdminOrder(row, holders[row.user_id]);
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

export function useOrdersAggregate(
  range?: { from: string; to: string },
  options: { enabled?: boolean } = {},
) {
  return useQuery({
    queryKey: ["orders-aggregate", range],
    // The aggregate carries revenue and club-wide counts; a gatekeeper's scan
    // screen must not request it at all, not merely hide the result.
    enabled: options.enabled ?? true,
    queryFn: () =>
      invokeFunction<OrdersAggregate>("orders-aggregate", {
        method: "POST",
        body: range ? { from: range.from, to: range.to } : {},
      }),
  });
}

// Scan stats moved to `./scan.ts` (P8-06); re-exported for existing callers.
export { useOrderScanUsage } from "./scan";
