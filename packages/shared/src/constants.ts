/** Shared business constants. Values are also mirrored in SQL/Edge Functions. */

/** Brand copy used across the member app. */
export const CLUB_NAME = 'KickOff';
export const CLUB_TAGLINE = 'Your digital ticket to match day.';
export const STADIUM = 'KickOff Arena';
export const COMPETITION = 'Thai Premier League';

/** A seat hold expires after 10 minutes. */
export const SEAT_HOLD_TTL_SECONDS = 600;

/** A single checkout may buy at most 8 seats. */
export const MAX_SEATS_PER_ORDER = 8;

/** Signed QR payload version produced by Edge Functions. */
export const QR_VERSION = 2 as const;

/** Holds are rejected this many minutes before kick-off. */
export const KICKOFF_LOCK_MINUTES = 15;

/** Unpaid orders are cancelled after this many minutes. */
export const PENDING_ORDER_TTL_MINUTES = 15;

/** Admin may undo a gate scan within this window. */
export const GATE_UNDO_SECONDS = 60;

/** Operating timezone for every formatted date/time. */
export const CLUB_TIMEZONE = 'Asia/Bangkok';

/** ISO 4217 code used for all Stripe amounts. */
export const CURRENCY = 'thb' as const;

/** Stripe expects the smallest currency unit; THB has 100 satang per baht. */
export const SATANG_PER_BAHT = 100;
