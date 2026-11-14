/**
 * Row shapes mirroring the Supabase schema created in Phase 3 (`supabase/migrations`).
 * Column names are `snake_case` on purpose — these types describe the database, not
 * the wire/UI contract. Use `dto.ts` for camelCase payloads sent to the apps.
 */

import type { StaffRole } from './roles';

export type IsoTimestamp = string;

/**
 * `profiles.role` — the one role vocabulary, owned by `roles.ts`.
 *
 * Kept as an alias because the row/DTO types read better with a short name;
 * the values are never repeated here, so `gatekeeper` cannot be forgotten.
 */
export type Role = StaffRole;
export type MatchStatus = 'upcoming' | 'live' | 'completed';
export type OrderStatus = 'pending' | 'paid' | 'failed' | 'cancelled' | 'refunded';
export type TicketStatus = 'valid' | 'used' | 'void';
export type ScanResultCode = 'valid' | 'used' | 'invalid' | 'wrong_match';
export type HomeAway = 'home' | 'away';
export type NewsCategory = 'Club News' | 'Match Report' | 'Announcement';
export type DevicePlatform = 'ios' | 'android' | 'web';

/** `public.profiles` (P3-02). */
export interface ProfileRow {
  id: string;
  email: string;
  full_name: string;
  role: Role;
  phone: string | null;
  created_at: IsoTimestamp;
  updated_at: IsoTimestamp;
}

/** `public.matches` (P3-03). Venue is a foreign key — see `VenueRow`. */
export interface MatchRow {
  id: string;
  opponent: string;
  opponent_short: string;
  kickoff_at: IsoTimestamp;
  venue_id: string;
  competition: string;
  home_away: HomeAway;
  status: MatchStatus;
  home_score: number | null;
  away_score: number | null;
  poster_colors: string[];
  accent: string;
  created_at: IsoTimestamp;
  updated_at: IsoTimestamp;
}

/** `public.venues` (punch list #12) — the single source of truth for grounds. */
export interface VenueRow {
  id: string;
  name: string;
  city: string | null;
  address: string | null;
  created_at: IsoTimestamp;
  updated_at: IsoTimestamp;
}

/** `public.zones` (P3-04). The price is not here — it lives on `match_zone_prices`. */
export interface ZoneRow {
  id: string;
  match_id: string;
  name: string;
  description: string;
  color: string;
  rows: string[];
  seats_per_row: number;
  created_at: IsoTimestamp;
  updated_at: IsoTimestamp;
}

/** `public.match_zone_prices` — what this zone costs for this match. */
export interface MatchZonePriceRow {
  match_id: string;
  zone_id: string;
  price_minor_units: number;
}

/** `public.seats` (P3-05). Physical inventory: occupancy is derived, not stored. */
export interface SeatRow {
  id: string;
  zone_id: string;
  row_label: string;
  number: number;
  created_at: IsoTimestamp;
}

/** `public.seat_holds` (P3-06). Active when `released_at` is null. */
export interface SeatHoldRow {
  id: string;
  hold_group_id: string;
  seat_id: string;
  match_id: string;
  user_id: string;
  expires_at: IsoTimestamp;
  released_at: IsoTimestamp | null;
  created_at: IsoTimestamp;
}

/** `public.orders` (P3-07). */
export interface OrderRow {
  id: string;
  user_id: string;
  match_id: string;
  amount_minor_units: number;
  status: OrderStatus;
  stripe_session_id: string | null;
  payment_intent_id: string | null;
  payment_ref: string | null;
  created_at: IsoTimestamp;
  updated_at: IsoTimestamp;
  paid_at: IsoTimestamp | null;
}

/** `public.order_seats` (P3-08). Snapshot of price/seat at purchase time. */
export interface OrderSeatRow {
  id: string;
  order_id: string;
  seat_id: string;
  ticket_id: string | null;
  zone_name: string;
  row_label: string;
  number: number;
  price_minor_units: number;
  created_at: IsoTimestamp;
}

/** `public.tickets` (P3-09). */
export interface TicketRow {
  id: string;
  order_id: string;
  order_seat_id: string;
  user_id: string;
  match_id: string;
  seat_id: string;
  qr_nonce: string;
  status: TicketStatus;
  issued_at: IsoTimestamp;
  used_at: IsoTimestamp | null;
  created_at: IsoTimestamp;
}

/** `public.scan_events` (P3-10). Append-only gate audit trail. */
export interface ScanEventRow {
  id: string;
  ticket_id: string;
  raw_hash: string;
  result: ScanResultCode;
  gate_id: string;
  admin_id: string;
  idempotency_key: string;
  undone_at: IsoTimestamp | null;
  created_at: IsoTimestamp;
}

/** `public.news_items` (P3-11). */
export interface NewsItemRow {
  id: string;
  title: string;
  excerpt: string;
  body: string;
  category: NewsCategory;
  published_at: IsoTimestamp;
  read_minutes: number;
  image_colors: string[];
  created_by: string | null;
  created_at: IsoTimestamp;
  updated_at: IsoTimestamp;
}

/** `public.audit_logs` (P3-12). */
export interface AuditLogRow {
  id: string;
  actor_id: string | null;
  action: string;
  entity: string;
  entity_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: IsoTimestamp;
}

/** `public.app_settings` (P3-13). */
export interface AppSettingRow {
  key: string;
  value: unknown;
  updated_at: IsoTimestamp;
  updated_by: string | null;
}

/** `public.device_tokens` (P3-14). */
export interface DeviceTokenRow {
  id: string;
  user_id: string;
  token: string;
  platform: DevicePlatform;
  created_at: IsoTimestamp;
}

/** `public.stripe_events` (P3-15). Webhook idempotency ledger. */
export interface StripeEventRow {
  id: string;
  type: string;
  processed_at: IsoTimestamp;
  created_at: IsoTimestamp;
}

/** `public.rate_limits` (P3-36). */
export interface RateLimitRow {
  key: string;
  window_start: IsoTimestamp;
  hits: number;
}
