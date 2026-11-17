import AsyncStorage from '@react-native-async-storage/async-storage';
import { createLogger } from '@kickoff/shared';

/**
 * The offline pass (C10.3, GAP-01).
 *
 * A venue with poor signal is the deferral GAP-01 records: the fan's pass
 * must still *render* at the gate, while the scan stays server-authoritative
 * — the gate refuses a used or void pass no matter what this screen shows.
 * So the cache records what the server already gave us, verbatim: the signed
 * payload is never re-encoded here (the QR contract has one implementation
 * and it lives in the Edge tier), and the ticket row rides along so the
 * screen has something to render beside the QR.
 *
 * Every operation is best-effort: a storage failure is logged and degrades
 * to "no cache", never to a broken pass for a fan who *is* online.
 */
const log = createLogger('pass');

/** The prefix every pass record lives under — `clearPasses` sweeps it. */
const PASS_PREFIX = 'kickoff.pass.';

/** The storage backend. Injectable so the tests run against memory. */
export interface PassStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
  getAllKeys(): Promise<readonly string[]>;
}

/** The record kinds: the signed payload and the row it belongs to. */
export type PassKind = 'qr' | 'ticket';

/** The namespaced key for one record — tickets never serve each other. */
export function passKey(kind: PassKind, ticketId: string): string {
  return `${PASS_PREFIX}${kind}.${ticketId}`;
}

async function write(storage: PassStorage, key: string, value: string): Promise<void> {
  try {
    await storage.setItem(key, value);
  } catch (error) {
    // A failed write costs the offline copy, nothing else — the live path
    // already succeeded by the time this runs.
    log.warn('pass.cache_write_failed', { key, error });
  }
}

async function read(storage: PassStorage, key: string): Promise<string | null> {
  try {
    return await storage.getItem(key);
  } catch (error) {
    log.warn('pass.cache_read_failed', { key, error });
    return null;
  }
}

/** Records the signed payload exactly as the server sent it. */
export async function cachePass(
  ticketId: string,
  payload: string,
  storage: PassStorage = AsyncStorage,
): Promise<void> {
  await write(storage, passKey('qr', ticketId), payload);
}

/** The last payload this device received for the ticket, or null. */
export async function readPass(
  ticketId: string,
  storage: PassStorage = AsyncStorage,
): Promise<string | null> {
  return read(storage, passKey('qr', ticketId));
}

/** Records the ticket row so the screen has its copy offline too. */
export async function cacheTicket<T>(
  ticketId: string,
  ticket: T,
  storage: PassStorage = AsyncStorage,
): Promise<void> {
  await write(storage, passKey('ticket', ticketId), JSON.stringify(ticket));
}

/** The last ticket row this device received, or null. */
export async function readTicket<T>(
  ticketId: string,
  storage: PassStorage = AsyncStorage,
): Promise<T | null> {
  const raw = await read(storage, passKey('ticket', ticketId));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch (error) {
    // A record we cannot parse is a record we do not have.
    log.warn('pass.cache_corrupt', { ticketId, error });
    return null;
  }
}

/**
 * Drops every cached pass — called on sign-out, because a shared device
 * must not keep one fan's passes behind another fan's session.
 */
export async function clearPasses(storage: PassStorage = AsyncStorage): Promise<void> {
  try {
    const keys = await storage.getAllKeys();
    const mine = keys.filter((key) => key.startsWith(PASS_PREFIX));
    await Promise.all(mine.map((key) => storage.removeItem(key)));
  } catch (error) {
    log.warn('pass.cache_clear_failed', { error });
  }
}
