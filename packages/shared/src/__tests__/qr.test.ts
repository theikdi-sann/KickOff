import { describe, expect, it } from 'vitest';

import {
  MOCK_QR_PREFIX,
  QR_V2_PREFIX,
  encodeTicketQrPayload,
  parseTicketQrPayload,
  ticketQrSigningPayload,
  type TicketQrPayloadV2,
} from '../qr';

const payload: TicketQrPayloadV2 = {
  v: 2,
  tid: 'tkt-1',
  mid: 'm-bkk',
  oid: 'ord-1',
  n: 'nonce-abc123',
  sig: 'c2lnbmF0dXJl',
};

describe('QR v2 payload', () => {
  it('round-trips encode → parse', () => {
    const encoded = encodeTicketQrPayload(payload);
    expect(encoded.startsWith(QR_V2_PREFIX)).toBe(true);

    const parsed = parseTicketQrPayload(encoded);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.payload).toEqual(payload);
  });

  it('produces a canonical signing string containing every signed field', () => {
    const canonical = ticketQrSigningPayload(payload);
    expect(canonical).toBe('v2|tkt-1|m-bkk|ord-1|nonce-abc123');
    expect(ticketQrSigningPayload({ ...payload, n: 'other' })).not.toBe(canonical);
    expect(ticketQrSigningPayload({ ...payload, tid: 'tkt-2' })).not.toBe(canonical);
  });

  it('rejects legacy v1 codes', () => {
    const result = parseTicketQrPayload(`${MOCK_QR_PREFIX}{"version":1}`);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/v1/i);
  });

  it('rejects codes without the KickOff prefix', () => {
    expect(parseTicketQrPayload('https://example.com/ticket').ok).toBe(false);
  });

  it('rejects malformed JSON', () => {
    expect(parseTicketQrPayload(`${QR_V2_PREFIX}{not-json`).ok).toBe(false);
  });

  it('rejects non-object payloads', () => {
    expect(parseTicketQrPayload(`${QR_V2_PREFIX}null`).ok).toBe(false);
    expect(parseTicketQrPayload(`${QR_V2_PREFIX}"string"`).ok).toBe(false);
    expect(parseTicketQrPayload(`${QR_V2_PREFIX}42`).ok).toBe(false);
  });

  it('rejects wrong versions', () => {
    expect(parseTicketQrPayload(`${QR_V2_PREFIX}${JSON.stringify({ ...payload, v: 1 })}`).ok).toBe(
      false,
    );
    expect(parseTicketQrPayload(`${QR_V2_PREFIX}${JSON.stringify({ ...payload, v: 3 })}`).ok).toBe(
      false,
    );
  });

  it('rejects payloads with missing or empty signature fields', () => {
    for (const field of ['tid', 'mid', 'oid', 'n', 'sig'] as const) {
      const broken = { ...payload, [field]: '' };
      expect(parseTicketQrPayload(encodeTicketQrPayload(broken as TicketQrPayloadV2)).ok).toBe(
        false,
      );
    }
  });
});
