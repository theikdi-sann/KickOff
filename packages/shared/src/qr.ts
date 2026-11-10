import type { Ticket } from './types';

/* ------------------------------------------------------------------ */
/* QR v2 — signed payload used from Phase 7 onward.                    */
/* Signing/verification happens only in Edge Functions (TICKET_HMAC).  */
/* ------------------------------------------------------------------ */

export const QR_V2_PREFIX = 'KICKOFF-V2:';

export interface TicketQrPayloadV2 {
  v: 2;
  /** ticket id */
  tid: string;
  /** match id */
  mid: string;
  /** order id */
  oid: string;
  /** unique nonce (`tickets.qr_nonce`) */
  n: string;
  /** base64url HMAC-SHA256 signature over `ticketQrSigningPayload` */
  sig: string;
}

export type UnsignedTicketQrPayloadV2 = Omit<TicketQrPayloadV2, 'sig'>;

/** Canonical bytes signed by the Edge Function — must stay stable. */
export function ticketQrSigningPayload(payload: UnsignedTicketQrPayloadV2): string {
  return `v2|${payload.tid}|${payload.mid}|${payload.oid}|${payload.n}`;
}

export function encodeTicketQrPayload(payload: TicketQrPayloadV2): string {
  return QR_V2_PREFIX + JSON.stringify(payload);
}

export function parseTicketQrPayload(
  raw: string,
): { ok: true; payload: TicketQrPayloadV2 } | { ok: false; reason: string } {
  const value = raw.trim();

  if (value.startsWith(MOCK_QR_PREFIX)) {
    return { ok: false, reason: 'Legacy v1 ticket codes are no longer accepted.' };
  }
  if (!value.startsWith(QR_V2_PREFIX)) {
    return { ok: false, reason: 'Not an KickOff ticket QR code.' };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(value.slice(QR_V2_PREFIX.length));
  } catch {
    return { ok: false, reason: 'Ticket payload could not be read.' };
  }

  if (typeof parsed !== 'object' || parsed === null) {
    return { ok: false, reason: 'Ticket payload is incomplete.' };
  }

  const candidate = parsed as Partial<TicketQrPayloadV2>;
  if (candidate.v !== 2) {
    return { ok: false, reason: 'Unsupported ticket payload version.' };
  }
  for (const field of ['tid', 'mid', 'oid', 'n', 'sig'] as const) {
    const fieldValue = candidate[field];
    if (typeof fieldValue !== 'string' || fieldValue.length === 0) {
      return { ok: false, reason: 'Ticket payload is incomplete.' };
    }
  }

  return {
    ok: true,
    payload: {
      v: 2,
      tid: candidate.tid as string,
      mid: candidate.mid as string,
      oid: candidate.oid as string,
      n: candidate.n as string,
      sig: candidate.sig as string,
    },
  };
}

/* ------------------------------------------------------------------ */
/* QR v1 — mock prototype payload. Deprecated; removed in Phase 10.    */
/* ------------------------------------------------------------------ */

/** @deprecated Use `QR_V2_PREFIX` / `TicketQrPayloadV2`. */
export const MOCK_QR_PREFIX = 'KICKOFF-MOCK-V1:';

/** @deprecated Use `TicketQrPayloadV2`. */
export interface MockQrPayload {
  version: 1;
  mock: true;
  ticketId: string;
  orderId: string;
  matchId: string;
  matchLabel: string;
  opponent: string;
  kickoffAt: string;
  venue: string;
  holder: string;
  zoneId: string;
  zoneName: string;
  row: string;
  number: number;
  seatLabel: string;
  priceSatang: number;
  issuedAt: string;
}

/** @deprecated Mock-only; real passes are issued by the Stripe webhook (P7-02). */
export function buildTicketQr(ticket: Omit<Ticket, 'qrPayload'>): string {
  const payload: MockQrPayload = {
    version: 1,
    mock: true,
    ticketId: ticket.id,
    orderId: ticket.orderId,
    matchId: ticket.matchId,
    matchLabel: ticket.matchLabel,
    opponent: ticket.opponent,
    kickoffAt: ticket.kickoffAt,
    venue: ticket.venue,
    holder: ticket.holder,
    zoneId: ticket.zoneId,
    zoneName: ticket.zoneName,
    row: ticket.row,
    number: ticket.number,
    seatLabel: ticket.seatLabel,
    priceSatang: ticket.priceSatang,
    issuedAt: ticket.issuedAt,
  };
  return MOCK_QR_PREFIX + JSON.stringify(payload);
}

/** @deprecated Use `parseTicketQrPayload`. */
export function decodeTicketQr(
  raw: string,
): { ok: true; payload: MockQrPayload } | { ok: false; reason: string } {
  const value = raw.trim();
  if (!value.startsWith(MOCK_QR_PREFIX)) {
    return { ok: false, reason: 'Not an KickOff ticket QR code.' };
  }
  try {
    const parsed = JSON.parse(value.slice(MOCK_QR_PREFIX.length)) as MockQrPayload;
    if (
      parsed?.version !== 1 ||
      !parsed.mock ||
      !parsed.ticketId ||
      !parsed.matchId ||
      !parsed.holder ||
      !parsed.seatLabel
    ) {
      return { ok: false, reason: 'Ticket payload is incomplete.' };
    }
    return { ok: true, payload: parsed };
  } catch {
    return { ok: false, reason: 'Ticket payload could not be read.' };
  }
}

/** @deprecated Use the database ticket returned by the scan Edge Function. */
export function ticketFromQr(payload: MockQrPayload, status: Ticket['status'] = 'valid'): Ticket {
  return {
    id: payload.ticketId,
    orderId: payload.orderId,
    matchId: payload.matchId,
    matchLabel: payload.matchLabel,
    opponent: payload.opponent,
    kickoffAt: payload.kickoffAt,
    venue: payload.venue,
    holder: payload.holder,
    zoneId: payload.zoneId,
    zoneName: payload.zoneName,
    row: payload.row,
    number: payload.number,
    seatLabel: payload.seatLabel,
    priceSatang: payload.priceSatang,
    status,
    issuedAt: payload.issuedAt,
    qrPayload: MOCK_QR_PREFIX + JSON.stringify(payload),
  };
}

/** @deprecated Mock id helper; real ids come from the database. */
export function makeMockId(prefix: string): string {
  const stamp = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 7);
  return `${prefix}-${stamp}-${random}`;
}
