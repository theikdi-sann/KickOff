// F-04 — the offline scan queue must never lose a scan silently.
//
// At the gate, a scan that could not reach the server is persisted so it can be
// replayed. The audit found that a corrupted queue was discarded by a bare
// `catch { return [] }`: the operator was never told, and the scanned passes
// were gone.
//
// The queue now reports what it could not read and quarantines the unreadable
// payload instead of deleting it.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  clearQueue,
  enqueueScan,
  listQueue,
  markAttempt,
  readQueue,
} from '../src/lib/offline-queue.ts';

/** A minimal in-memory `Storage` stand-in. */
function fakeStorage(initial: Record<string, string> = {}): Storage {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
    removeItem: (key: string) => void map.delete(key),
    clear: () => map.clear(),
    key: (index: number) => [...map.keys()][index] ?? null,
    get length() {
      return map.size;
    },
  } as Storage;
}

const STORAGE_KEY = 'kickoff.scan.queue.v1';

test('a clean queue reads without complaint', () => {
  const storage = fakeStorage();
  enqueueScan({ qr: 'KICKOFF-V2:{"tid":"t1"}', gateId: 'gate-1', id: 'scan-1' }, storage);

  const state = readQueue(storage);

  assert.equal(state.corrupted, false);
  assert.equal(state.quarantined, 0);
  assert.equal(state.payloadUnreadable, false);
  assert.equal(state.entries.length, 1);
  assert.equal(state.entries[0]?.id, 'scan-1');
});

test('a corrupted queue is reported instead of being silently dropped', () => {
  const storage = fakeStorage({ [STORAGE_KEY]: '{not json' });

  const state = readQueue(storage);

  assert.equal(state.corrupted, true, 'the operator must be told the queue is unreadable');
  assert.equal(state.entries.length, 0);
  assert.notEqual(listQueue(storage), undefined);
});

test('an unreadable payload reports an unknown count, not a guess', () => {
  const storage = fakeStorage({ [STORAGE_KEY]: '{not json' });

  const state = readQueue(storage);

  assert.equal(state.payloadUnreadable, true);
  assert.equal(state.quarantined, 0, 'the number of lost scans is unknown — it must not be guessed');
});

test('a corrupted queue is quarantined, not deleted', () => {
  const storage = fakeStorage({ [STORAGE_KEY]: '{not json' });

  readQueue(storage);

  const quarantined = storage.getItem('kickoff.scan.queue.corrupt');
  assert.ok(quarantined, 'the unreadable payload must be kept for recovery');
  assert.match(quarantined, /not json/);
});

test('unreadable entries are quarantined while the valid ones survive', () => {
  const storage = fakeStorage({
    [STORAGE_KEY]: JSON.stringify([
      { id: 'scan-1', qr: 'KICKOFF-V2:{}', gateId: 'gate-1', createdAt: '2026-11-13T10:00:00Z' },
      { id: 'scan-2' },
      'not-an-object',
    ]),
  });

  const state = readQueue(storage);

  assert.equal(state.entries.length, 1, 'the valid scan must survive');
  assert.equal(state.entries[0]?.id, 'scan-1');
  assert.equal(state.quarantined, 2, 'both unreadable entries must be counted');
  assert.equal(state.payloadUnreadable, false);
  assert.ok(storage.getItem('kickoff.scan.queue.corrupt'), 'the unreadable entries must be kept');
});

test('a replayed scan keeps its idempotency key across attempts', () => {
  const storage = fakeStorage();
  const queued = enqueueScan(
    { qr: 'KICKOFF-V2:{"tid":"t1"}', gateId: 'gate-1', id: 'scan-retry-1' },
    storage,
  );

  markAttempt(queued.id, 'network down', storage);
  markAttempt(queued.id, 'network down', storage);
  const [entry] = listQueue(storage);

  assert.equal(entry?.id, 'scan-retry-1', 'the retry must reuse the server idempotency key');
  assert.equal(entry?.attempts, 2);
  assert.equal(entry?.lastError, 'network down');
});

test('re-enqueuing the same id replaces instead of double-admitting', () => {
  const storage = fakeStorage();
  enqueueScan({ qr: 'KICKOFF-V2:{"tid":"t1"}', gateId: 'gate-1', id: 'scan-1' }, storage);
  enqueueScan({ qr: 'KICKOFF-V2:{"tid":"t1"}', gateId: 'gate-1', id: 'scan-1' }, storage);

  assert.equal(listQueue(storage).length, 1, 'one scan key must never become two admissions');
});

test('clearing the queue leaves nothing behind', () => {
  const storage = fakeStorage();
  enqueueScan({ qr: 'KICKOFF-V2:{}', gateId: 'gate-1', id: 'scan-1' }, storage);
  clearQueue(storage);

  const state = readQueue(storage);

  assert.equal(state.entries.length, 0);
  assert.equal(state.corrupted, false);
  assert.equal(state.payloadUnreadable, false);
});
