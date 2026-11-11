import { z } from 'zod';

import { MAX_SEATS_PER_ORDER } from './constants';
import type {
  HoldDto,
  MatchDto,
  NewsDto,
  OrderDto,
  ProfileDto,
  ScanResultDto,
  SeatDto,
  TicketDto,
  ZoneDto,
} from './dto';

/* ------------------------------------------------------------------ */
/* Primitives                                                          */
/* ------------------------------------------------------------------ */

export const idSchema = z.string().min(1).max(64);
export const isoTimestampSchema = z.iso.datetime({ offset: true });
export const satangSchema = z.number().int().min(0).max(100_000_000);
export const hexColorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Expected a #RRGGBB colour');
export const nonEmptyTextSchema = z.string().trim().min(1);
export const colorPairSchema = z.tuple([hexColorSchema, hexColorSchema]);

export const roleSchema = z.enum(['customer', 'admin']);
export const matchStatusSchema = z.enum(['upcoming', 'live', 'completed']);
export const seatStatusSchema = z.enum(['available', 'sold', 'held']);
export const orderStatusSchema = z.enum(['pending', 'paid', 'failed', 'cancelled', 'refunded']);
export const ticketStatusSchema = z.enum(['valid', 'used', 'void']);
export const scanResultCodeSchema = z.enum(['valid', 'used', 'invalid', 'wrong_match']);
export const homeAwaySchema = z.enum(['home', 'away']);
export const newsCategorySchema = z.enum(['Club News', 'Match Report', 'Announcement']);

/* ------------------------------------------------------------------ */
/* Wire DTO schemas                                                    */
/* ------------------------------------------------------------------ */

export const profileDtoSchema = z.object({
  id: idSchema,
  email: z.email(),
  fullName: nonEmptyTextSchema.max(120),
  role: roleSchema,
  phone: z.string().max(32).nullable().optional(),
  joinedAt: isoTimestampSchema,
});

export const matchDtoSchema = z.object({
  id: idSchema,
  opponent: nonEmptyTextSchema.max(120),
  opponentShort: nonEmptyTextSchema.max(8),
  kickoffAt: isoTimestampSchema,
  venue: nonEmptyTextSchema.max(120),
  competition: nonEmptyTextSchema.max(120),
  homeAway: homeAwaySchema,
  status: matchStatusSchema,
  homeScore: z.number().int().min(0).max(99).nullable().optional(),
  awayScore: z.number().int().min(0).max(99).nullable().optional(),
  posterColors: colorPairSchema,
  accent: hexColorSchema,
});

export const zoneDtoSchema = z.object({
  id: idSchema,
  matchId: idSchema,
  name: nonEmptyTextSchema.max(80),
  description: z.string().max(240),
  priceSatang: satangSchema,
  color: hexColorSchema,
  rows: z.array(z.string().min(1).max(4)).min(1).max(50),
  seatsPerRow: z.number().int().min(1).max(100),
});

export const seatDtoSchema = z.object({
  id: idSchema,
  zoneId: idSchema,
  row: z.string().min(1).max(4),
  number: z.number().int().min(1).max(1000),
  label: z.string().min(1).max(12),
  status: seatStatusSchema,
});

export const holdDtoSchema = z.object({
  id: idSchema,
  matchId: idSchema,
  seatIds: z.array(idSchema).min(1).max(MAX_SEATS_PER_ORDER),
  expiresAt: isoTimestampSchema,
  releasedAt: isoTimestampSchema.nullable().optional(),
  createdAt: isoTimestampSchema,
});

export const orderSeatDtoSchema = z.object({
  seatId: idSchema,
  ticketId: idSchema.nullable(),
  zoneId: idSchema,
  zoneName: nonEmptyTextSchema.max(80),
  row: z.string().min(1).max(4),
  number: z.number().int().min(1).max(1000),
  priceSatang: satangSchema,
});

export const orderDtoSchema = z.object({
  id: idSchema,
  userId: idSchema,
  matchId: idSchema,
  matchLabel: nonEmptyTextSchema.max(160),
  seats: z.array(orderSeatDtoSchema).min(1).max(MAX_SEATS_PER_ORDER),
  amountSatang: satangSchema,
  status: orderStatusSchema,
  createdAt: isoTimestampSchema,
  paidAt: isoTimestampSchema.nullable().optional(),
  paymentRef: z.string().max(128).nullable().optional(),
  checkoutUrl: z.string().max(2048).nullable().optional(),
  expiresAt: isoTimestampSchema.nullable().optional(),
});

export const ticketDtoSchema = z.object({
  id: idSchema,
  orderId: idSchema,
  matchId: idSchema,
  matchLabel: nonEmptyTextSchema.max(160),
  opponent: nonEmptyTextSchema.max(120),
  kickoffAt: isoTimestampSchema,
  venue: nonEmptyTextSchema.max(120),
  holder: nonEmptyTextSchema.max(120),
  zoneId: idSchema,
  zoneName: nonEmptyTextSchema.max(80),
  row: z.string().min(1).max(4),
  number: z.number().int().min(1).max(1000),
  seatLabel: z.string().min(1).max(12),
  priceSatang: satangSchema,
  status: ticketStatusSchema,
  issuedAt: isoTimestampSchema,
  usedAt: isoTimestampSchema.nullable().optional(),
  qrPayload: z.string().min(1).max(4096),
});

export const newsDtoSchema = z.object({
  id: idSchema,
  title: nonEmptyTextSchema.max(160),
  excerpt: z.string().max(400),
  body: z.string().min(1),
  category: newsCategorySchema,
  publishedAt: isoTimestampSchema,
  readMinutes: z.number().int().min(1).max(120),
  imageColors: colorPairSchema,
});

export const scanResultDtoSchema = z.object({
  ok: z.boolean(),
  code: scanResultCodeSchema,
  title: nonEmptyTextSchema.max(80),
  message: nonEmptyTextSchema.max(400),
  ticket: ticketDtoSchema.optional(),
  scanEventId: idSchema.optional(),
  gateId: idSchema.optional(),
});

/* ------------------------------------------------------------------ */
/* Request schemas                                                     */
/* ------------------------------------------------------------------ */

export const signInSchema = z.object({
  email: z.email(),
  password: z.string().min(8).max(72),
});

export const signUpSchema = z.object({
  email: z.email(),
  password: z.string().min(8).max(72),
  fullName: nonEmptyTextSchema.max(120),
  phone: z.string().max(32).optional(),
});

export const createHoldSchema = z.object({
  matchId: idSchema,
  seatIds: z
    .array(idSchema)
    .min(1)
    .max(MAX_SEATS_PER_ORDER)
    .refine((ids) => new Set(ids).size === ids.length, 'Duplicate seat ids'),
});

export const createOrderSchema = z.object({
  holdId: idSchema,
});

export const scanPayloadSchema = z.object({
  payload: z.string().min(1).max(4096),
  gateId: idSchema,
});

export const adminCreateMatchSchema = z.object({
  opponent: nonEmptyTextSchema.max(120),
  opponentShort: nonEmptyTextSchema.max(8),
  kickoffAt: isoTimestampSchema,
  venue: nonEmptyTextSchema.max(120),
  competition: nonEmptyTextSchema.max(120),
  homeAway: homeAwaySchema,
  posterColors: colorPairSchema,
  accent: hexColorSchema,
});

export const adminUpdateZoneSchema = z.object({
  name: nonEmptyTextSchema.max(80),
  description: z.string().max(240),
  priceSatang: satangSchema,
  color: hexColorSchema,
  rows: z.array(z.string().min(1).max(4)).min(1).max(50),
  seatsPerRow: z.number().int().min(1).max(100),
});

export const newsInputSchema = z.object({
  title: nonEmptyTextSchema.max(160),
  excerpt: z.string().max(400),
  body: z.string().min(1),
  category: newsCategorySchema,
  publishedAt: isoTimestampSchema,
  readMinutes: z.number().int().min(1).max(120),
  imageColors: colorPairSchema,
});

export const paginationSchema = z.object({
  page: z.number().int().min(1).max(10_000).default(1),
  perPage: z.number().int().min(1).max(100).default(20),
});

export const profileUpdateSchema = z.object({
  fullName: nonEmptyTextSchema.max(120).optional(),
  phone: z.string().max(32).nullable().optional(),
});

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(8).max(72),
    newPassword: z.string().min(8).max(72),
  })
  .refine((value) => value.currentPassword !== value.newPassword, {
    message: 'New password must differ from the current password',
    path: ['newPassword'],
  });

export const refundOrderSchema = z.object({
  orderId: idSchema,
  reason: z.string().max(400).optional(),
  overrideUsedTickets: z.boolean().default(false),
});

export const settingsUpdateSchema = z.record(z.string().min(1).max(80), z.unknown());

/* ------------------------------------------------------------------ */
/* Compile-time assertions: every DTO schema infers its DTO exactly.   */
/* ------------------------------------------------------------------ */

type Equals<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Expect<T extends true> = T;

type _ProfileDto = Expect<Equals<z.infer<typeof profileDtoSchema>, ProfileDto>>;
type _MatchDto = Expect<Equals<z.infer<typeof matchDtoSchema>, MatchDto>>;
type _ZoneDto = Expect<Equals<z.infer<typeof zoneDtoSchema>, ZoneDto>>;
type _SeatDto = Expect<Equals<z.infer<typeof seatDtoSchema>, SeatDto>>;
type _HoldDto = Expect<Equals<z.infer<typeof holdDtoSchema>, HoldDto>>;
type _OrderDto = Expect<Equals<z.infer<typeof orderDtoSchema>, OrderDto>>;
type _TicketDto = Expect<Equals<z.infer<typeof ticketDtoSchema>, TicketDto>>;
type _NewsDto = Expect<Equals<z.infer<typeof newsDtoSchema>, NewsDto>>;
type _ScanResultDto = Expect<Equals<z.infer<typeof scanResultDtoSchema>, ScanResultDto>>;
