import { describe, expect, it } from 'vitest';
import type { ZodType } from 'zod';

import * as schemas from '../schemas';

const validMatch = {
  id: 'm-bkk',
  opponent: 'Bangkok Rovers',
  opponentShort: 'BKR',
  kickoffAt: '2026-11-14T18:00:00+07:00',
  venue: 'XClub Arena',
  competition: 'Thai Premier League',
  homeAway: 'home',
  status: 'upcoming',
  posterColors: ['#0B6B3A', '#052E1A'],
  accent: '#F4C430',
};

const validZone = {
  id: 'm-bkk-north',
  matchId: 'm-bkk',
  name: 'North Stand',
  description: 'Behind the goal',
  priceSatang: 35000,
  color: '#22C55E',
  rows: ['A', 'B'],
  seatsPerRow: 12,
};

type InvalidCase = { name: string; schema: ZodType; payload: unknown };

const cases: InvalidCase[] = [
  { name: 'signIn: missing email', schema: schemas.signInSchema, payload: { password: 'longenough' } },
  { name: 'signIn: malformed email', schema: schemas.signInSchema, payload: { email: 'fan-at-xclub', password: 'longenough' } },
  { name: 'signIn: short password', schema: schemas.signInSchema, payload: { email: 'fan@xclub.app', password: 'short' } },
  { name: 'signUp: missing full name', schema: schemas.signUpSchema, payload: { email: 'fan@xclub.app', password: 'longenough' } },
  { name: 'signUp: blank full name', schema: schemas.signUpSchema, payload: { email: 'fan@xclub.app', password: 'longenough', fullName: '   ' } },
  { name: 'createHold: empty seats', schema: schemas.createHoldSchema, payload: { matchId: 'm-bkk', seatIds: [] } },
  { name: 'createHold: more than 8 seats', schema: schemas.createHoldSchema, payload: { matchId: 'm-bkk', seatIds: Array.from({ length: 9 }, (_, i) => `s-${i}`) } },
  { name: 'createHold: duplicate seats', schema: schemas.createHoldSchema, payload: { matchId: 'm-bkk', seatIds: ['s-1', 's-1'] } },
  { name: 'createHold: missing match', schema: schemas.createHoldSchema, payload: { seatIds: ['s-1'] } },
  { name: 'createOrder: missing hold id', schema: schemas.createOrderSchema, payload: {} },
  { name: 'scanPayload: empty payload', schema: schemas.scanPayloadSchema, payload: { payload: '', gateId: 'gate-2' } },
  { name: 'scanPayload: missing gate', schema: schemas.scanPayloadSchema, payload: { payload: 'XCLUB-V2:{}' } },
  { name: 'adminCreateMatch: bad home/away', schema: schemas.adminCreateMatchSchema, payload: { ...validMatch, homeAway: 'neutral' } },
  { name: 'adminCreateMatch: bad colour', schema: schemas.adminCreateMatchSchema, payload: { ...validMatch, accent: 'gold' } },
  { name: 'adminCreateMatch: bad kickoff', schema: schemas.adminCreateMatchSchema, payload: { ...validMatch, kickoffAt: '2026-11-14 18:00' } },
  { name: 'adminCreateMatch: wrong colour tuple', schema: schemas.adminCreateMatchSchema, payload: { ...validMatch, posterColors: ['#0B6B3A'] } },
  { name: 'adminUpdateZone: negative price', schema: schemas.adminUpdateZoneSchema, payload: { ...validZone, priceSatang: -1 } },
  { name: 'adminUpdateZone: fractional price', schema: schemas.adminUpdateZoneSchema, payload: { ...validZone, priceSatang: 350.5 } },
  { name: 'adminUpdateZone: empty rows', schema: schemas.adminUpdateZoneSchema, payload: { ...validZone, rows: [] } },
  { name: 'adminUpdateZone: zero seats per row', schema: schemas.adminUpdateZoneSchema, payload: { ...validZone, seatsPerRow: 0 } },
  { name: 'newsInput: bad category', schema: schemas.newsInputSchema, payload: { title: 'T', excerpt: 'E', body: 'B', category: 'Gossip', publishedAt: '2026-11-04T10:00:00+07:00', readMinutes: 2, imageColors: ['#0B6B3A', '#022C22'] } },
  { name: 'newsInput: zero read minutes', schema: schemas.newsInputSchema, payload: { title: 'T', excerpt: 'E', body: 'B', category: 'Club News', publishedAt: '2026-11-04T10:00:00+07:00', readMinutes: 0, imageColors: ['#0B6B3A', '#022C22'] } },
  { name: 'profileUpdate: blank name', schema: schemas.profileUpdateSchema, payload: { fullName: '' } },
  { name: 'changePassword: short new password', schema: schemas.changePasswordSchema, payload: { currentPassword: 'longenough', newPassword: 'short' } },
  { name: 'changePassword: identical passwords', schema: schemas.changePasswordSchema, payload: { currentPassword: 'samepassword', newPassword: 'samepassword' } },
  { name: 'refundOrder: missing order id', schema: schemas.refundOrderSchema, payload: { reason: 'duplicate' } },
  { name: 'pagination: zero page', schema: schemas.paginationSchema, payload: { page: 0, perPage: 20 } },
  { name: 'pagination: perPage too large', schema: schemas.paginationSchema, payload: { page: 1, perPage: 1000 } },
  { name: 'settingsUpdate: empty key', schema: schemas.settingsUpdateSchema, payload: { '': true } },
  { name: 'matchDto: bad status', schema: schemas.matchDtoSchema, payload: { ...validMatch, status: 'postponed' } },
  { name: 'zoneDto: negative price', schema: schemas.zoneDtoSchema, payload: { ...validZone, priceSatang: -100 } },
  { name: 'seatDto: unknown status', schema: schemas.seatDtoSchema, payload: { id: 's-1', zoneId: 'z-1', row: 'A', number: 1, label: 'A1', status: 'reserved' } },
];

describe('zod schemas reject invalid payloads', () => {
  it('covers at least 20 invalid payloads', () => {
    expect(cases.length).toBeGreaterThanOrEqual(20);
    expect(new Set(cases.map((item) => item.name)).size).toBe(cases.length);
  });

  it.each(cases)('$name', ({ schema, payload }) => {
    expect(schema.safeParse(payload).success).toBe(false);
  });
});

describe('zod schemas accept known-good payloads', () => {
  it('accepts the baseline match and zone', () => {
    expect(schemas.matchDtoSchema.safeParse(validMatch).success).toBe(true);
    expect(schemas.zoneDtoSchema.safeParse(validZone).success).toBe(true);
  });

  it('applies pagination defaults', () => {
    const parsed = schemas.paginationSchema.parse({});
    expect(parsed).toEqual({ page: 1, perPage: 20 });
  });
});
