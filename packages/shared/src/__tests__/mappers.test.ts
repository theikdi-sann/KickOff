import { describe, expect, it } from 'vitest';

import {
  toOrderDto,
  toTicketDto,
  type OrderJoinRow,
  type TicketJoinRow,
} from '../mappers';

const orderRow: OrderJoinRow = {
  id: 'ord-1',
  user_id: 'usr-1',
  match_id: 'm-1',
  amount_satang: 120000,
  status: 'paid',
  created_at: '2026-11-01T10:00:00Z',
  paid_at: '2026-11-01T10:05:00Z',
  payment_ref: 'pi_123',
  checkout_url: 'https://checkout.stripe.test/session',
  expires_at: '2026-11-01T10:20:00Z',
  order_seats: [
    {
      seat_id: 'seat-1',
      ticket_id: 'tkt-1',
      zone_name: 'North Stand',
      row_label: 'A',
      number: 12,
      price_satang: 120000,
    },
  ],
  matches: { opponent: 'Rovers FC' },
};

const ticketRow: TicketJoinRow = {
  id: 'tkt-1',
  order_id: 'ord-1',
  match_id: 'm-1',
  status: 'valid',
  issued_at: '2026-11-01T10:05:00Z',
  used_at: null,
  matches: {
    opponent: 'Rovers FC',
    kickoff_at: '2026-11-08T12:00:00Z',
    venue: { name: 'KickOff Arena' },
  },
  seats: { row_label: 'A', number: 12, zones: { name: 'North Stand' } },
  order_seats: { price_satang: 120000 },
};

describe('toOrderDto', () => {
  it('maps a paid order and its seat snapshot to the wire DTO', () => {
    const dto = toOrderDto(orderRow);

    expect(dto.id).toBe('ord-1');
    expect(dto.userId).toBe('usr-1');
    expect(dto.matchId).toBe('m-1');
    expect(dto.matchLabel).toBe('KickOff vs Rovers FC');
    expect(dto.amountSatang).toBe(120000);
    expect(dto.status).toBe('paid');
    expect(dto.paymentRef).toBe('pi_123');
    expect(dto.checkoutUrl).toBe('https://checkout.stripe.test/session');
    expect(dto.seats).toEqual([
      {
        seatId: 'seat-1',
        ticketId: 'tkt-1',
        zoneId: '',
        zoneName: 'North Stand',
        row: 'A',
        number: 12,
        priceSatang: 120000,
      },
    ]);
  });

  it('falls back to a pending order when the stored status is unknown', () => {
    const dto = toOrderDto({ ...orderRow, status: 'mystery' });
    expect(dto.status).toBe('pending');
  });

  it('survives a missing match join and empty seat snapshot', () => {
    const dto = toOrderDto({ ...orderRow, matches: null, order_seats: [] });

    expect(dto.matchLabel).toBe('KickOff vs opponent');
    expect(dto.seats).toEqual([]);
  });
});

describe('toTicketDto', () => {
  it('maps a valid ticket with its seat, zone and holder', () => {
    const dto = toTicketDto(ticketRow, 'Alex Supporter');

    expect(dto.id).toBe('tkt-1');
    expect(dto.orderId).toBe('ord-1');
    expect(dto.matchLabel).toBe('KickOff vs Rovers FC');
    expect(dto.opponent).toBe('Rovers FC');
    expect(dto.kickoffAt).toBe('2026-11-08T12:00:00Z');
    expect(dto.venue).toBe('KickOff Arena');
    expect(dto.holder).toBe('Alex Supporter');
    expect(dto.zoneName).toBe('North Stand');
    expect(dto.row).toBe('A');
    expect(dto.number).toBe(12);
    expect(dto.seatLabel).toBe('A12');
    expect(dto.priceSatang).toBe(120000);
    expect(dto.status).toBe('valid');
    expect(dto.issuedAt).toBe('2026-11-01T10:05:00Z');
    expect(dto.qrPayload).toBe('');
  });

  it('falls back to a void ticket when the stored status is unknown', () => {
    const dto = toTicketDto({ ...ticketRow, status: 'mystery' }, 'Alex Supporter');
    expect(dto.status).toBe('void');
  });

  it('survives missing seat and venue joins', () => {
    const dto = toTicketDto(
      { ...ticketRow, seats: null, order_seats: null, matches: null },
      'Alex Supporter',
    );

    expect(dto.zoneName).toBe('');
    expect(dto.row).toBe('');
    expect(dto.number).toBe(0);
    expect(dto.seatLabel).toBe('0');
    expect(dto.priceSatang).toBe(0);
    expect(dto.venue).toBe('KickOff Arena');
  });
});
