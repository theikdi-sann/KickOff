/**
 * Barrel for shared data shapes.
 *
 * Canonical types now live in `entities.ts` (database rows) and `dto.ts` (wire
 * payloads). The camelCase interfaces below are the Phase A UI shapes; they are
 * kept only until Phase 10 moves every screen onto DTOs.
 */
import type {
  MatchStatus,
  NewsCategory,
  OrderStatus,
  Role,
  ScanResultCode,
  SeatStatus,
  TicketStatus,
} from './entities';

export type {
  AppSettingRow,
  AuditLogRow,
  DevicePlatform,
  DeviceTokenRow,
  HomeAway,
  IsoTimestamp,
  MatchRow,
  MatchStatus,
  NewsCategory,
  NewsItemRow,
  OrderRow,
  OrderSeatRow,
  OrderStatus,
  ProfileRow,
  RateLimitRow,
  Role,
  ScanEventRow,
  ScanResultCode,
  SeatHoldRow,
  SeatRow,
  SeatStatus,
  StripeEventRow,
  TicketRow,
  TicketStatus,
} from './entities';
export type * from './dto';

/** @deprecated Phase A UI shape — migrate to `ProfileDto`. */
export interface Profile {
  id: string;
  email: string;
  fullName: string;
  role: Role;
  phone?: string;
  initials: string;
  joinedAt: string;
}

/** @deprecated Phase A UI shape — migrate to `MatchDto`. */
export interface Match {
  id: string;
  opponent: string;
  opponentShort: string;
  kickoffAt: string;
  venue: string;
  competition: string;
  homeAway: 'home' | 'away';
  status: MatchStatus;
  homeScore?: number;
  awayScore?: number;
  posterColors: [string, string];
  accent: string;
}

/** @deprecated Phase A UI shape — migrate to `ZoneDto`. */
export interface Zone {
  id: string;
  matchId: string;
  name: string;
  description: string;
  priceSatang: number;
  color: string;
  rows: string[];
  seatsPerRow: number;
}

/** @deprecated Phase A UI shape — migrate to `SeatDto`. */
export interface Seat {
  id: string;
  zoneId: string;
  row: string;
  number: number;
  label: string;
  status: SeatStatus;
}

/** @deprecated Phase A UI shape — migrate to `NewsDto`. */
export interface NewsItem {
  id: string;
  title: string;
  excerpt: string;
  body: string;
  category: NewsCategory;
  publishedAt: string;
  readMinutes: number;
  imageColors: [string, string];
}

/** @deprecated Phase A UI shape — migrate to `OrderSeatDto`. */
export interface OrderSeat {
  ticketId: string;
  zoneId: string;
  zoneName: string;
  row: string;
  number: number;
  priceSatang: number;
}

/** @deprecated Phase A UI shape — migrate to `OrderDto`. */
export interface Order {
  id: string;
  userId: string;
  matchId: string;
  matchLabel: string;
  seats: OrderSeat[];
  amountSatang: number;
  status: OrderStatus;
  createdAt: string;
  paymentRef: string;
}

/** @deprecated Phase A UI shape — migrate to `TicketDto`. */
export interface Ticket {
  id: string;
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
  status: TicketStatus;
  issuedAt: string;
  usedAt?: string;
  qrPayload: string;
}

/** @deprecated Phase A UI shape — migrate to `ScanResultDto`. */
export interface ScanResult {
  ok: boolean;
  code: ScanResultCode;
  title: string;
  message: string;
  ticket?: Ticket;
}

/** @deprecated Phase A auth shape — replace with Supabase session state (P5-11). */
export interface DemoSession {
  profile: Profile;
  signedInAt: string;
}

/** @deprecated Phase A booking shape — replace with holds (P6-05). */
export interface BookingSelection {
  matchId: string;
  zoneId: string;
  seatIds: string[];
}
