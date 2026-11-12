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

/** An e-mail address as the auth screens accept it. */
export const emailSchema = z.email();

/** A password as the auth screens accept it (Supabase's 72-byte limit). */
export const passwordSchema = z.string().min(8).max(72);

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
  email: emailSchema,
  password: passwordSchema,
});

export const signUpSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  // The register screen has always required at least two characters — a
  // single letter is a typo, not a name — so the rule lives here, where both
  // apps and any future client get it for free.
  fullName: z.string().trim().min(2).max(120),
  phone: z.string().max(32).optional(),
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

/* ------------------------------------------------------------------ */
/* Admin reschedule (punch list #13)                                   */
/* ------------------------------------------------------------------ */

export interface RescheduleContext {
  /** The fixture's current kickoff — a reschedule may never move it earlier. */
  currentKickoffAt: string;
  /** Evaluation time (ISO) — injectable so the rules are deterministic. */
  now?: string;
  /** `kickoff_lock_minutes` from app settings (defaults to 15). */
  lockMinutes?: number;
  /** Fixture status — only upcoming fixtures may be rescheduled. */
  status?: z.infer<typeof matchStatusSchema>;
}

/**
 * Kick-off reschedule rules (walkthrough #13), enforced in the shared Zod
 * schema — deliberately no DB trigger or RPC. Each rule lands with its own
 * test (RS-x); the context carries the fixture's current state.
 */
export function adminRescheduleSchema(context: RescheduleContext) {
  const nowMs = new Date(context.now ?? new Date().toISOString()).getTime();
  const currentMs = new Date(context.currentKickoffAt).getTime();
  const lockMinutes = context.lockMinutes ?? 15;

  return z
    .object({
      kickoffAt: isoTimestampSchema,
      // RS-5: the reason is always required, 1–400 characters after trim.
      reason: nonEmptyTextSchema.max(400),
    })
    .superRefine((value, ctx) => {
      const nextMs = new Date(value.kickoffAt).getTime();

      // RS-6: only upcoming fixtures may move — a started or finished match
      // is off the table, and the timing rules below stop mattering.
      if (context.status !== undefined && context.status !== 'upcoming') {
        ctx.addIssue({
          code: 'custom',
          path: ['kickoffAt'],
          message: 'Only upcoming fixtures can be rescheduled',
        });
        return;
      }

      // RS-2: never in the past — checked first so a past time gets the
      // honest "future" message instead of the lock-window one.
      if (nextMs <= nowMs) {
        ctx.addIssue({
          code: 'custom',
          path: ['kickoffAt'],
          message: 'The new kickoff must be in the future',
        });
      } else if (nextMs < nowMs + lockMinutes * 60_000) {
        // RS-1: never inside the kickoff lock window.
        ctx.addIssue({
          code: 'custom',
          path: ['kickoffAt'],
          message: `The kickoff must stay outside the ${lockMinutes}-minute lock window`,
        });
      }

      // RS-3: a reschedule only ever pushes a fixture forward.
      if (nextMs < currentMs) {
        ctx.addIssue({
          code: 'custom',
          path: ['kickoffAt'],
          message: 'A fixture cannot be moved to an earlier time',
        });
      }

      // RS-4: at most 10 days beyond the current kickoff.
      const maxMs = currentMs + 10 * 24 * 60 * 60 * 1000;
      if (nextMs > maxMs) {
        ctx.addIssue({
          code: 'custom',
          path: ['kickoffAt'],
          message: 'A fixture can be moved back at most 10 days',
        });
      }
    });
}

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

/** The validated pager, as a list query consumes it. */
export type PaginationParams = z.output<typeof paginationSchema>;

export const profileUpdateSchema = z.object({
  fullName: nonEmptyTextSchema.max(120).optional(),
  phone: z.string().max(32).nullable().optional(),
});

// The refund body lives in `./refund.ts` — the canonical source the Edge
// Function's generated copy is built from — and is re-exported here so the
// shared package still has one front door.
export { refundOrderSchema, type RefundOrderInput } from './refund';

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
