import { cachePass, cacheTicket, clearPasses, passKey, readPass, readTicket, type PassStorage } from '../pass-cache';

// C10.3 — the offline pass (GAP-01): the cache is the whole feature, so its
// behaviour is proven against an in-memory storage, not a device.

function memoryStorage(): PassStorage & { dump(): Map<string, string> } {
  const map = new Map<string, string>();
  return {
    dump: () => map,
    async getItem(key) {
      return map.get(key) ?? null;
    },
    async setItem(key, value) {
      map.set(key, value);
    },
    async removeItem(key) {
      map.delete(key);
    },
    async getAllKeys() {
      return [...map.keys()];
    },
  };
}

describe('passKey', () => {
  it('namespaces every record under the pass prefix', () => {
    expect(passKey('qr', 'tkt-1')).toContain('tkt-1');
    expect(passKey('qr', 'tkt-1')).not.toBe(passKey('ticket', 'tkt-1'));
  });
});

describe('cachePass / readPass', () => {
  it('round-trips the signed payload verbatim', async () => {
    const storage = memoryStorage();
    const payload = 'signed-payload-bytes-verbatim';
    await cachePass('tkt-1', payload, storage);
    expect(await readPass('tkt-1', storage)).toBe(payload);
  });

  it('reads null for a pass it has never seen', async () => {
    expect(await readPass('nope', memoryStorage())).toBeNull();
  });

  it('keeps tickets apart — one pass never serves another', async () => {
    const storage = memoryStorage();
    await cachePass('tkt-1', 'payload-one', storage);
    await cachePass('tkt-2', 'payload-two', storage);
    expect(await readPass('tkt-1', storage)).toBe('payload-one');
    expect(await readPass('tkt-2', storage)).toBe('payload-two');
  });
});

describe('cacheTicket / readTicket', () => {
  it('round-trips the ticket row as JSON', async () => {
    const storage = memoryStorage();
    const ticket = { id: 'tkt-1', status: 'valid', venue: 'KickOff Arena' };
    await cacheTicket('tkt-1', ticket, storage);
    expect(await readTicket<{ id: string; status: string; venue: string }>('tkt-1', storage)).toEqual(
      ticket,
    );
  });

  it('reads null when nothing was recorded', async () => {
    expect(await readTicket('missing', memoryStorage())).toBeNull();
  });
});

describe('clearPasses', () => {
  it('removes every cached pass and leaves other storage alone', async () => {
    const storage = memoryStorage();
    await storage.setItem('unrelated.key', 'keep-me');
    await cachePass('tkt-1', 'payload-one', storage);
    await cacheTicket('tkt-1', { id: 'tkt-1' }, storage);

    await clearPasses(storage);

    expect(await readPass('tkt-1', storage)).toBeNull();
    expect(await readTicket('tkt-1', storage)).toBeNull();
    expect(await storage.getItem('unrelated.key')).toBe('keep-me');
  });

  it('is safe to clear when nothing was ever cached', async () => {
    await expect(clearPasses(memoryStorage())).resolves.toBeUndefined();
  });
});
