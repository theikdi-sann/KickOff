import { getEnv } from "../_shared/config.ts";
import { AppError } from "../_shared/errors.ts";
import { ok, serveJson } from "../_shared/http.ts";
import { logger } from "../_shared/logger.ts";
import { countHoldConflicts, failedScans, metricsTokenMatches } from "../_shared/metrics.ts";
import { UNSETTLED_CODE } from "../_shared/observability.ts";
import { serviceClient } from "../_shared/supabase.ts";

/** Uptime/alerting snapshot (P11-18). Scans and holds are windowed; orders are totals. */
const WINDOW_HOURS = 24;
const WINDOW_MS = WINDOW_HOURS * 60 * 60 * 1000;

const ORDER_STATUSES = ["pending", "paid", "refunded", "cancelled", "failed"] as const;
const SCAN_RESULTS = ["valid", "used", "invalid", "wrong_match", "wrong_zone"] as const;

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

interface AvailabilityRow {
  month: string;
  probes: number;
  ok_probes: number;
  availability_pct: number | null;
}

/** NFR-14: the monthly availability target. */
const AVAILABILITY_TARGET = 99.5;

async function handler(request: Request): Promise<Response> {
  const env = getEnv();
  if (!metricsTokenMatches(request.headers.get("x-metrics-token"), env.METRICS_TOKEN)) {
    throw new AppError("unauthorized", "Invalid metrics token");
  }

  const db = serviceClient();
  const since = new Date(Date.now() - WINDOW_MS).toISOString();

  const [orderCounts, scanCounts, holdsResult, errorCount, unsettledCount] = await Promise.all([
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
    // The alertable numbers (C10.1): incidents recorded in the window, and
    // the ones a human still has to settle — the C8.1 leftover, scraped.
    exactCount(
      db.from("error_events").select("id", { head: true, count: "exact" }).gte("created_at", since),
    ),
    exactCount(
      db
        .from("error_events")
        .select("id", { head: true, count: "exact" })
        .eq("code", UNSETTLED_CODE)
        .gte("created_at", since),
    ),
  ]);

  if (holdsResult.error) throw new Error(holdsResult.error.message);
  const holds = (holdsResult.data ?? []) as HoldRow[];

  const { data: availabilityRows, error: availabilityError } = await db
    .from("availability_monthly")
    .select("month,probes,ok_probes,availability_pct")
    .order("month", { ascending: false })
    .limit(1);
  if (availabilityError) throw new Error(availabilityError.message);
  const availabilityRow = ((availabilityRows ?? []) as AvailabilityRow[])[0];

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
          wrongZone: scansByResult.wrong_zone,
        }),
      },
      holds: {
        created: holds.length,
        conflicts: countHoldConflicts(holds.map((hold) => hold.seat_id)),
      },
      errors: {
        total: errorCount,
      },
      reconciliation: {
        unsettled: unsettledCount,
      },
      availability: {
        month: availabilityRow?.month ?? null,
        probes: availabilityRow?.probes ?? 0,
        okProbes: availabilityRow?.ok_probes ?? 0,
        pct: availabilityRow?.availability_pct ?? null,
        target: AVAILABILITY_TARGET,
        met:
          availabilityRow?.availability_pct === null || availabilityRow?.availability_pct === undefined
            ? null
            : availabilityRow.availability_pct >= AVAILABILITY_TARGET,
      },
    },
    request,
  );
}

logger.info("metrics.booting");
Deno.serve(serveJson(handler, ["GET"]));
