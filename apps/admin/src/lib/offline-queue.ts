/**
 * Durable offline queue for gate scans.
 *
 * Every scan attempt gets an idempotency key before it leaves the browser. If
 * the network fails the attempt is persisted so "sync now" can replay it with
 * the same key — the server then returns the original result instead of
 * admitting the same pass twice.
 */

export interface QueuedScan {
  /** Idempotency key; also the record id. */
  id: string;
  qr: string;
  gateId: string;
  createdAt: string;
  attempts: number;
  lastError?: string;
}

type StorageLike = Pick<Storage, "getItem" | "setItem">;

const STORAGE_KEY = "xclub.scan.queue.v1";
const MAX_ENTRIES = 100;

/** URL-safe key accepted by the Edge Function's `Idempotency-Key` check. */
export function makeIdempotencyKey(): string {
  const cryptoApi = typeof globalThis.crypto === "undefined" ? undefined : globalThis.crypto;
  if (cryptoApi && typeof cryptoApi.randomUUID === "function") {
    return cryptoApi.randomUUID().replaceAll("-", "");
  }
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
}

function storageOrNull(storage?: StorageLike): StorageLike | null {
  if (storage) return storage;
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function isQueuedScan(value: unknown): value is QueuedScan {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Partial<QueuedScan>;
  return (
    typeof record.id === "string" &&
    record.id.length > 0 &&
    typeof record.qr === "string" &&
    record.qr.length > 0 &&
    typeof record.gateId === "string" &&
    record.gateId.length > 0 &&
    typeof record.createdAt === "string"
  );
}

export function listQueue(storage?: StorageLike): QueuedScan[] {
  const store = storageOrNull(storage);
  if (!store) return [];

  try {
    const raw = store.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(isQueuedScan)
      .map((entry) => ({ ...entry, attempts: entry.attempts ?? 0 }));
  } catch {
    return [];
  }
}

function persist(entries: QueuedScan[], storage?: StorageLike): boolean {
  const store = storageOrNull(storage);
  if (!store) return false;
  try {
    store.setItem(STORAGE_KEY, JSON.stringify(entries.slice(-MAX_ENTRIES)));
    return true;
  } catch {
    // Quota or private mode. Callers that must not lose a scan check this.
    return false;
  }
}

export function enqueueScan(
  scan: { qr: string; gateId: string; id?: string },
  storage?: StorageLike,
): QueuedScan {
  const entry: QueuedScan = {
    id: scan.id ?? makeIdempotencyKey(),
    qr: scan.qr,
    gateId: scan.gateId,
    createdAt: new Date().toISOString(),
    attempts: 0,
  };

  const existing = listQueue(storage).filter((queued) => queued.id !== entry.id);
  if (existing.length >= MAX_ENTRIES) {
    throw new Error("The offline scan queue is full. Sync before scanning more passes.");
  }
  if (!persist([...existing, entry], storage)) {
    throw new Error("Offline storage is unavailable, so this scan could not be queued.");
  }
  return entry;
}

export function removeScan(id: string, storage?: StorageLike): void {
  persist(
    listQueue(storage).filter((entry) => entry.id !== id),
    storage,
  );
}

export function markAttempt(id: string, error: string, storage?: StorageLike): void {
  persist(
    listQueue(storage).map((entry) =>
      entry.id === id
        ? { ...entry, attempts: entry.attempts + 1, lastError: error }
        : entry,
    ),
    storage,
  );
}

export function clearQueue(storage?: StorageLike): void {
  persist([], storage);
}
