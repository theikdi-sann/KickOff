import { afterEach, describe, expect, it, vi } from 'vitest';

import { createLogger, logger, redact } from '../logging';

// Phase C4 — C4.11: one logging convention.
//
// The Edge Functions already had a structured, redacting JSON logger, and the
// apps logged with bare `console.error` — two conventions, and a redaction
// list that only existed on one side. The shared package now owns the single
// logger; the deployed Edge copy is generated from it, and the apps call it
// with a scope.

describe('redact', () => {
  it('masks every known secret key at the top level', () => {
    const output = redact({
      password: 'hunter2',
      authorization: 'Bearer abc',
      token: 'tok_123',
      safe: 'keep-me',
    });

    expect(output).toEqual({
      password: '[redacted]',
      authorization: '[redacted]',
      token: '[redacted]',
      safe: 'keep-me',
    });
  });

  it('masks secrets nested at any depth', () => {
    const output = redact({ outer: { payment: { apikey: 'sk_live_x' } } });

    expect(output.outer).toEqual({ payment: { apikey: '[redacted]' } });
  });

  it('caps recursion so a cyclic structure cannot hang the logger', () => {
    const output = redact({ level1: { level2: { level3: { level4: { level5: { level6: { level7: 'deep' } } } } } } });

    expect(JSON.stringify(output)).toContain('[max-depth]');
  });
});

describe('Error serialisation', () => {
  it('turns an Error into its name, message and stack — JSON.stringify alone loses them', () => {
    const error = new Error('boom');
    const output = redact({ error });

    expect(output.error).toMatchObject({ name: 'Error', message: 'boom' });
    expect(String((output.error as { stack?: string }).stack)).toContain('boom');
  });
});

describe('createLogger', () => {
  afterEach(() => vi.restoreAllMocks());

  it('emits one JSON line carrying level, scope, message and time', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const log = createLogger('admin.audit');

    log.error('audit write failed', { action: 'match.update' });

    expect(spy).toHaveBeenCalledTimes(1);
    const entry = JSON.parse(String(spy.mock.calls[0][0]));
    expect(entry).toMatchObject({
      level: 'error',
      scope: 'admin.audit',
      message: 'audit write failed',
      action: 'match.update',
    });
    expect(typeof entry.time).toBe('string');
  });

  it('routes warn to console.warn and info to console.log', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const info = vi.spyOn(console, 'log').mockImplementation(() => {});

    createLogger('mobile.push').warn('token stale');
    createLogger('mobile.push').info('ready');

    expect(warn).toHaveBeenCalledTimes(1);
    expect(info).toHaveBeenCalledTimes(1);
  });

  it('redacts secrets from the emitted context', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

    createLogger('admin.audit').error('failed', { password: 'hunter2' });

    const entry = JSON.parse(String(spy.mock.calls[0][0]));
    expect(entry.password).toBe('[redacted]');
  });
});

describe('the default logger (the Edge Functions import it)', () => {
  afterEach(() => vi.restoreAllMocks());

  it('keeps the scope-less shape the deployed functions already emit', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    logger.warn('scan.stale_payload', { ticketId: 'tkt_1' });

    const entry = JSON.parse(String(spy.mock.calls[0][0]));
    expect(entry).toMatchObject({ level: 'warn', message: 'scan.stale_payload', ticketId: 'tkt_1' });
    expect(typeof entry.time).toBe('string');
    expect('scope' in entry).toBe(false);
  });
});
