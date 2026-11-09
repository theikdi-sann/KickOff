import { z } from "zod";

import { requireAdmin } from "../_shared/auth.ts";
import { ok, serveJson } from "../_shared/http.ts";
import { serviceClient } from "../_shared/supabase.ts";
import { validateBody, validateQuery } from "../_shared/validate.ts";

const querySchema = z.object({
  from: z.iso.datetime({ offset: true }).optional(),
  to: z.iso.datetime({ offset: true }).optional(),
});

interface OrderLite {
  id: string;
  amount_satang: number;
  status: string;
}

interface ScanLite {
  result: string;
}

function defaultRange(): { from: string; to: string } {
  const to = new Date();
  const from = new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);
  return { from: from.toISOString(), to: to.toISOString() };
}

async function handler(request: Request): Promise<Response> {
  await requireAdmin(request);
  const query =
    request.method === "POST"
      ? await validateBody(request, querySchema)
      : validateQuery(request, querySchema);
  const defaults = defaultRange();
  const range = { from: query.from ?? defaults.from, to: query.to ?? defaults.to };
  const db = serviceClient();

  const { data: orders, error: orderError } = await db
    .from("orders")
    .select("id,amount_satang,status")
    .gte("created_at", range.from)
    .lte("created_at", range.to)
    .in("status", ["paid", "refunded"]);
  if (orderError) throw orderError;

  const paid = ((orders ?? []) as OrderLite[]).filter((order) => order.status === "paid");
  const paidIds = paid.map((order) => order.id);
  const revenueSatang = paid.reduce((sum, order) => sum + order.amount_satang, 0);

  let ticketsSold = 0;
  if (paidIds.length > 0) {
    const { count, error } = await db
      .from("order_seats")
      .select("id", { head: true, count: "exact" })
      .in("order_id", paidIds);
    if (error) throw error;
    ticketsSold = count ?? 0;
  }

  const { data: scans, error: scanError } = await db
    .from("scan_events")
    .select("result")
    .gte("created_at", range.from)
    .lte("created_at", range.to);
  if (scanError) throw scanError;

  const scanRows = (scans ?? []) as ScanLite[];
  const scansByResult = scanRows.reduce<Record<string, number>>((acc, scan) => {
    acc[scan.result] = (acc[scan.result] ?? 0) + 1;
    return acc;
  }, {});

  return ok(
    {
      range,
      revenueSatang,
      ordersPaid: paid.length,
      ordersRefunded: ((orders ?? []) as OrderLite[]).filter((o) => o.status === "refunded").length,
      ticketsSold,
      scans: {
        total: scanRows.length,
        valid: scansByResult.valid ?? 0,
        used: scansByResult.used ?? 0,
        invalid: scansByResult.invalid ?? 0,
        wrongMatch: scansByResult.wrong_match ?? 0,
      },
    },
    request,
  );
}

Deno.serve(serveJson(handler, ["GET", "POST"]));
