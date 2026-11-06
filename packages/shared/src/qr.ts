import type { Ticket } from './types';

export const MOCK_QR_PREFIX = 'XCLUB-MOCK-V1:';

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

export function decodeTicketQr(
  raw: string,
): { ok: true; payload: MockQrPayload } | { ok: false; reason: string } {
  const value = raw.trim();
  if (!value.startsWith(MOCK_QR_PREFIX)) {
    return { ok: false, reason: 'Not an XClub ticket QR code.' };
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

export function makeMockId(prefix: string): string {
  const stamp = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 7);
  return `${prefix}-${stamp}-${random}`;
}
