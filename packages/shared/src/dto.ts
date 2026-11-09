/**
 * Wire DTOs — camelCase payloads exchanged between apps, Edge Functions and the
 * database. Monetary fields are always integer satang (never floats/baht).
 */
import type {
  HomeAway,
  IsoTimestamp,
  MatchStatus,
  NewsCategory,
  OrderStatus,
  Role,
  ScanResultCode,
  SeatStatus,
  TicketStatus,
} from './entities';

export interface ProfileDto {
  id: string;
  email: string;
  fullName: string;
  role: Role;
  phone?: string | null;
  joinedAt: IsoTimestamp;
}

export interface MatchDto {
  id: string;
  opponent: string;
  opponentShort: string;
  kickoffAt: IsoTimestamp;
  venue: string;
  competition: string;
  homeAway: HomeAway;
  status: MatchStatus;
  homeScore?: number | null;
  awayScore?: number | null;
  posterColors: [string, string];
  accent: string;
}

export interface ZoneDto {
  id: string;
  matchId: string;
  name: string;
  description: string;
  priceSatang: number;
  color: string;
  rows: string[];
  seatsPerRow: number;
}

export interface SeatDto {
  id: string;
  zoneId: string;
  row: string;
  number: number;
  label: string;
  status: SeatStatus;
}

export interface HoldDto {
  id: string;
  matchId: string;
  seatIds: string[];
  expiresAt: IsoTimestamp;
  releasedAt?: IsoTimestamp | null;
  createdAt: IsoTimestamp;
}

export interface OrderSeatDto {
  seatId: string;
  ticketId: string | null;
  zoneId: string;
  zoneName: string;
  row: string;
  number: number;
  priceSatang: number;
}

export interface OrderDto {
  id: string;
  userId: string;
  matchId: string;
  matchLabel: string;
  seats: OrderSeatDto[];
  amountSatang: number;
  status: OrderStatus;
  createdAt: IsoTimestamp;
  paidAt?: IsoTimestamp | null;
  paymentRef?: string | null;
}

export interface TicketDto {
  id: string;
  orderId: string;
  matchId: string;
  matchLabel: string;
  opponent: string;
  kickoffAt: IsoTimestamp;
  venue: string;
  holder: string;
  zoneId: string;
  zoneName: string;
  row: string;
  number: number;
  seatLabel: string;
  priceSatang: number;
  status: TicketStatus;
  issuedAt: IsoTimestamp;
  usedAt?: IsoTimestamp | null;
  /** Signed QR v2 payload (see `qr.ts`). */
  qrPayload: string;
}

export interface NewsDto {
  id: string;
  title: string;
  excerpt: string;
  body: string;
  category: NewsCategory;
  publishedAt: IsoTimestamp;
  readMinutes: number;
  imageColors: [string, string];
}

export interface ScanResultDto {
  ok: boolean;
  code: ScanResultCode;
  title: string;
  message: string;
  ticket?: TicketDto;
  scanEventId?: string;
  gateId?: string;
}

export interface PaginatedDto<T> {
  items: T[];
  page: number;
  perPage: number;
  total: number;
}
