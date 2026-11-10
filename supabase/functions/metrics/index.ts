import { getEnv } from "../_shared/config.ts";
import { AppError } from "../_shared/errors.ts";
import { ok, serveJson } from "../_shared/http.ts";
import { logger } from "../_shared/logger.ts";
import { countHoldConflicts, failedScans, metricsTokenMatches } from "../_shared/metrics.ts";
import { serviceClient } from "../_shared/supabase.ts";

/** Uptime/alerting snapshot (P11-18). Scans and holds are windowed; orders are totals. */
const WINDOW_HOURS = 24;
const WINDOW_MS = WINDOW_HOURS * 60 * 60 * 1000;

const ORDER_STATUSES = ["pending", "paid", "refunded", "cancelled", "failed"] as const;
const SCAN_RESULTS = ["valid", "used", "invalid", "wrong_match"] as const;

type OrderStatus = (typeof ORDER_STATUSES)[number];
type ScanResult = (typeof SCAN_RESULTS)[number];

interface CountQuery extends PromiseLike<{ count: number | null; error: { message: string } | null }> {}

async function exactCount(query: CountQuery): Promise<number> {
  const { count, error } = await query;
  if (error) throw new Error(error.message);
  return count ?? 0;
}

interface HoldRow {
  seat_id: string;
}

async function handler(request: Request): Promise<Response> {
  const env = getEnv();
  if (!metricsTokenMatches(request.headers.get("x-metrics-token"), env.METRICS_TOKEN)) {
    throw new AppError("unauthorized", "Invalid metrics token");
  }

  const db = serviceClient();
  const since = new Date(Date.now() - WINDOW_MS).toISOString();

  const [orderCounts, scanCounts, holdsResult] = await Promise.all([
    Promise.all(
      ORDER_STATUSES.map((status) =>
        exactCount(
          db.from("orders").select("id", { head: true, count: "exact" }).eq("status", status),
        ),
      ),
    ),
    Promise.all(
      SCAN_RESULTS.map((result) =>
        exactCount(
          db
            .from("scan_events")
            .select("id", { head: true, count: "exact" })
            .eq("result", result)
            .gte("created_at", since),
        ),
      ),
    ),
    db.from("seat_holds").select("seat_id").gte("created_at", since),
  ]);

  if (holdsResult.error) throw new Error(holdsResult.error.message);
  const holds = (holdsResult.data ?? []) as HoldRow[];

  const ordersByStatus = Object.fromEntries(
    ORDER_STATUSES.map((status, index) => [status, orderCounts[index] ?? 0]),
  ) as Record<OrderStatus, number>;
  const scansByResult = Object.fromEntries(
    SCAN_RESULTS.map((result, index) => [result, scanCounts[index] ?? 0]),
  ) as Record<ScanResult, number>;

  const ordersTotal = ORDER_STATUSES.reduce((sum, status) => sum + ordersByStatus[status], 0);
  const scansTotal = SCAN_RESULTS.reduce((sum, result) => sum + scansByResult[result], 0);

  return ok(
    {
      generatedAt: new Date().toISOString(),
      windowHours: WINDOW_HOURS,
      orders: { total: ordersTotal, ...ordersByStatus },
      scans: {
        total: scansTotal,
        ...scansByResult,
        failed: failedScans({
          invalid: scansByResult.invalid,
          wrongMatch: scansByResult.wrong_match,
        }),
      },
      holds: {
        created: holds.length,
        conflicts: countHoldConflicts(holds.map((hold) => hold.seat_id)),
      },
    },
    request,
  );
}

logger.info("metrics.booting");
Deno.serve(serveJson(handler, ["GET"]));
