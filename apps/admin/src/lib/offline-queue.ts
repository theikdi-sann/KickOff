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

const STORAGE_KEY = "kickoff.scan.queue.v1";
/** Where an unreadable payload is kept so it can be recovered, never dropped. */
const CORRUPT_KEY = "kickoff.scan.queue.corrupt";
const MAX_ENTRIES = 100;

/**
 * The state of the offline queue.
 *
 * `corrupted` means part of the stored queue could not be read. The operator
 * must be told: a scan that was persisted and then lost is a pass that was
 * never admitted.
 */
export interface QueueState {
  /** The scans that could be read. */
  entries: QueuedScan[];
  /** True when part of the stored queue could not be read. */
  corrupted: boolean;
  /** How many individual entries could not be read. */
  quarantined: number;
  /**
   * True when the whole payload was unreadable — how many scans it held is
   * unknown, so the count must not be guessed.
   */
  payloadUnreadable: boolean;
}

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

/**
 * Reads the offline queue and reports what could not be read.
 *
 * An unreadable payload is **quarantined**, never deleted: the operator has to
 * know that a scan may have been lost, and support has to be able to recover
 * it. Reading therefore repairs the storage — the unreadable payload is moved
 * aside before anything can overwrite it.
 */
export function readQueue(storage?: StorageLike): QueueState {
  const store = storageOrNull(storage);
  if (!store) return { entries: [], corrupted: false, quarantined: 0, payloadUnreadable: false };

  let raw: string | null;
  try {
    raw = store.getItem(STORAGE_KEY);
  } catch {
    // Storage is blocked (private mode) — there is nothing stored to lose.
    return { entries: [], corrupted: false, quarantined: 0, payloadUnreadable: false };
  }
  if (!raw) return { entries: [], corrupted: false, quarantined: 0, payloadUnreadable: false };

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    quarantine(store, raw);
    return { entries: [], corrupted: true, quarantined: 0, payloadUnreadable: true };
  }
  if (!Array.isArray(parsed)) {
    quarantine(store, raw);
    return { entries: [], corrupted: true, quarantined: 0, payloadUnreadable: true };
  }

  const entries: QueuedScan[] = [];
  const unreadable: unknown[] = [];
  for (const candidate of parsed) {
    if (isQueuedScan(candidate)) {
      entries.push({ ...candidate, attempts: candidate.attempts ?? 0 });
    } else {
      unreadable.push(candidate);
    }
  }

  if (unreadable.length > 0) {
    quarantine(store, JSON.stringify(unreadable));
    return {
      entries,
      corrupted: true,
      quarantined: unreadable.length,
      payloadUnreadable: false,
    };
  }

  return { entries, corrupted: false, quarantined: 0, payloadUnreadable: false };
}

/** Keeps an unreadable payload for recovery instead of discarding it. */
function quarantine(store: StorageLike, payload: string): void {
  try {
    store.setItem(CORRUPT_KEY, payload);
  } catch {
    // Quarantine is best-effort: the caller still reports the corruption.
  }
}

/** The scans that could be read. Prefer `readQueue` when corruption matters. */
export function listQueue(storage?: StorageLike): QueuedScan[] {
  return readQueue(storage).entries;
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
