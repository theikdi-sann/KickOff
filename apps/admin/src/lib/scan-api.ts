"use client";

import type { ScanResultDto } from "@kickoff/shared";
import { invokeFunction } from "@/lib/functions";
import {
  enqueueScan,
  listQueue,
  makeIdempotencyKey,
  markAttempt,
  removeScan,
  type QueuedScan,
} from "@/lib/offline-queue";

/** Server result plus the local timestamp used by the undo countdown. */
export interface ScanApiResult extends ScanResultDto {
  gateId: string;
  scanEventId?: string;
  replayed?: boolean;
  scannedAt: string;
}

export interface QueuedScanResult {
  ok: false;
  code: "queued";
  title: string;
  message: string;
  gateId: string;
}

export type ScanOutcome = ScanApiResult | QueuedScanResult;

export interface DemoPass {
  gateId: string;
  gateName: string;
  payload: string;
  ticket: ScanResultDto["ticket"];
}

function isNetworkError(error: unknown): boolean {
  if ((error as { network?: boolean } | null)?.network === true) return true;
  const name = (error as { name?: string } | null)?.name;
  return (
    name === "FunctionsFetchError" ||
    name === "FunctionsRelayError" ||
    name === "TypeError"
  );
}

function queuedOutcome(gateId: string): QueuedScanResult {
  return {
    ok: false,
    code: "queued",
    title: "Saved offline",
    message:
      "No connection. The scan is queued and will be replayed with the same idempotency key when the gate is back online.",
    gateId,
  };
}

async function submitScan(
  qr: string,
  gateId: string,
  idempotencyKey: string,
): Promise<ScanApiResult> {
  const result = await invokeFunction<Omit<ScanApiResult, "scannedAt">>("scan-ticket", {
    method: "POST",
    body: { qr, gateId },
    headers: { "Idempotency-Key": idempotencyKey },
  });
  return { ...result, scannedAt: new Date().toISOString() };
}

/** Scans a pass; on a network failure it is persisted for later replay. */
export async function scanTicket(qr: string, gateId: string): Promise<ScanOutcome> {
  const idempotencyKey = makeIdempotencyKey();
  try {
    return await submitScan(qr, gateId, idempotencyKey);
  } catch (error) {
    if (isNetworkError(error)) {
      enqueueScan({ qr, gateId, id: idempotencyKey });
      return queuedOutcome(gateId);
    }
    throw error;
  }
}

export async function undoScan(scanEventId: string, gateId: string): Promise<{ ticket: unknown }> {
  return invokeFunction<{ ticket: unknown }>("scan-undo", {
    method: "POST",
    body: { scanEventId, gateId },
  });
}

export async function getDemoPass(gateId: string): Promise<DemoPass> {
  return invokeFunction<DemoPass>("scan-demo", { method: "POST", body: { gateId } });
}

export interface ReplayReport {
  attempted: number;
  synced: number;
  failed: number;
  remaining: number;
  stopped: boolean;
}

/**
 * Replays the offline queue in order. Each entry keeps its original key, so the
 * server treats a retry as a replay instead of a second admission.
 */
export async function replayQueue(): Promise<ReplayReport> {
  const queue = listQueue();
  const report: ReplayReport = {
    attempted: 0,
    synced: 0,
    failed: 0,
    remaining: queue.length,
    stopped: false,
  };

  for (const entry of queue) {
    report.attempted += 1;
    try {
      await submitScan(entry.qr, entry.gateId, entry.id);
      removeScan(entry.id);
      report.synced += 1;
    } catch (error) {
      const status = (error as { status?: number } | null)?.status;
      // Network failures, rate limits and 5xx are retryable; keep the entry so
      // the same idempotency key can be replayed later.
      if (isNetworkError(error) || status === undefined || status >= 500 || status === 429) {
        markAttempt(entry.id, error instanceof Error ? error.message : "Transient failure");
        report.stopped = true;
        break;
      }
      // A terminal 4xx (bad gate, deleted ticket) will never become valid.
      removeScan(entry.id);
      report.failed += 1;
    }
  }

  report.remaining = listQueue().length;
  return report;
}

/** Convenience for the "sync now" button. */
export async function syncQueuedScans(): Promise<ReplayReport> {
  return replayQueue();
}

export type { QueuedScan };
