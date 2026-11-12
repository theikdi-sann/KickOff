/**
 * Row → wire DTO mappers. Kept in shared so both apps map Supabase rows the
 * same way (snake_case columns → camelCase payloads).
 */
import type {
  MatchDto,
  NewsDto,
  OrderDto,
  OrderSeatDto,
  ProfileDto,
  SeatDto,
  TicketDto,
  ZoneDto,
} from './dto';
import type {
  MatchRow,
  NewsItemRow,
  OrderStatus,
  ProfileRow,
  SeatRow,
  TicketStatus,
  ZoneRow,
} from './entities';
import { CLUB_NAME, STADIUM } from './constants';
import { brand } from './theme';

function pair(colors: string[] | null, fallback: [string, string]): [string, string] {
  return [colors?.[0] ?? fallback[0], colors?.[1] ?? fallback[1]];
}

/** `orders` joined with its seat snapshot and the fixture's opponent. */
export interface OrderJoinRow {
  id: string;
  user_id: string;
  match_id: string;
  amount_satang: number;
  /** Stored as text — narrowed by `toOrderStatus`. */
  status: string;
  created_at: string;
  paid_at: string | null;
  payment_ref: string | null;
  /** Optional: the staff console does not select the checkout columns. */
  checkout_url?: string | null;
  expires_at?: string | null;
  order_seats?: OrderSeatJoinRow[] | null;
  matches: { opponent: string } | null;
}

/** A seat line of an order, joined from `order_seats`. */
export interface OrderSeatJoinRow {
  seat_id: string;
  ticket_id: string | null;
  zone_name: string;
  row_label: string;
  number: number;
  price_satang: number;
}

/** `tickets` joined with the fixture, the seat and the purchased price. */
export interface TicketJoinRow {
  id: string;
  order_id: string;
  match_id: string;
  /** Stored as text — narrowed by `toTicketStatus`. */
  status: string;
  issued_at: string;
  used_at: string | null;
  matches: {
    opponent: string;
    kickoff_at: string;
    venue: { name: string } | null;
  } | null;
  seats: { row_label: string; number: number; zones: { name: string } | null } | null;
  order_seats: { price_satang: number } | null;
}

const ORDER_STATUSES: readonly OrderStatus[] = [
  'pending',
  'paid',
  'failed',
  'cancelled',
  'refunded',
];

const TICKET_STATUSES: readonly TicketStatus[] = ['valid', 'used', 'void'];

/** Narrows a stored order status; an unknown value must never reach the UI. */
export function toOrderStatus(value: string): OrderStatus {
  return ORDER_STATUSES.includes(value as OrderStatus) ? (value as OrderStatus) : 'pending';
}

/** Narrows a stored ticket status; an unknown value must never reach the UI. */
export function toTicketStatus(value: string): TicketStatus {
  return TICKET_STATUSES.includes(value as TicketStatus) ? (value as TicketStatus) : 'void';
}

/** The match label shown on an order and a pass. */
export function toMatchLabel(opponent: string | null | undefined): string {
  return `${CLUB_NAME} vs ${opponent ?? 'opponent'}`;
}

/** Maps an order with its seat snapshot to the wire DTO. */
export function toOrderDto(row: OrderJoinRow): OrderDto {
  const seats: OrderSeatDto[] = (row.order_seats ?? []).map((seat) => ({
    seatId: seat.seat_id,
    ticketId: seat.ticket_id,
    zoneId: '',
    zoneName: seat.zone_name,
    row: seat.row_label,
    number: seat.number,
    priceSatang: seat.price_satang,
  }));

  return {
    id: row.id,
    userId: row.user_id,
    matchId: row.match_id,
    matchLabel: toMatchLabel(row.matches?.opponent),
    seats,
    amountSatang: row.amount_satang,
    status: toOrderStatus(row.status),
    createdAt: row.created_at,
    paidAt: row.paid_at,
    paymentRef: row.payment_ref,
    checkoutUrl: row.checkout_url,
    expiresAt: row.expires_at,
  };
}

/** Maps a ticket with its seat and fixture joins to the wire DTO. */
export function toTicketDto(row: TicketJoinRow, holder: string): TicketDto {
  const seat = row.seats;
  const rowLabel = seat?.row_label ?? '';
  const number = seat?.number ?? 0;

  return {
    id: row.id,
    orderId: row.order_id,
    matchId: row.match_id,
    matchLabel: toMatchLabel(row.matches?.opponent),
    opponent: row.matches?.opponent ?? '',
    kickoffAt: row.matches?.kickoff_at ?? '',
    venue: row.matches?.venue?.name ?? STADIUM,
    holder,
    zoneId: '',
    zoneName: seat?.zones?.name ?? '',
    row: rowLabel,
    number,
    seatLabel: `${rowLabel}${number}`,
    priceSatang: row.order_seats?.price_satang ?? 0,
    status: toTicketStatus(row.status),
    issuedAt: row.issued_at,
    usedAt: row.used_at,
    qrPayload: '',
  };
}

type MatchRowLike = Omit<MatchRow, 'home_away'> & {
  home_away: string;
  /** Embedded via `select('*, venues(name)')` — matches.venue_id FK. */
  venues?: { name: string } | null;
};

export function toMatchDto(row: MatchRowLike): MatchDto {
  return {
    id: row.id,
    opponent: row.opponent,
    opponentShort: row.opponent_short,
    kickoffAt: row.kickoff_at,
    venue: row.venues?.name ?? STADIUM,
    competition: row.competition,
    homeAway: row.home_away === 'away' ? 'away' : 'home',
    status: row.status,
    homeScore: row.home_score,
    awayScore: row.away_score,
    posterColors: pair(row.poster_colors, [brand.primary, '#052E1A']),
    accent: row.accent,
  };
}

export function toZoneDto(row: ZoneRow): ZoneDto {
  return {
    id: row.id,
    matchId: row.match_id,
    name: row.name,
    description: row.description,
    priceSatang: row.price_satang,
    color: row.color,
    rows: row.rows,
    seatsPerRow: row.seats_per_row,
  };
}

export function toSeatDto(row: SeatRow): SeatDto {
  return {
    id: row.id,
    zoneId: row.zone_id,
    row: row.row_label,
    number: row.number,
    label: `${row.row_label}${row.number}`,
    status: row.status,
  };
}

type NewsRowLike = Omit<NewsItemRow, 'category'> & { category: string };

export function toNewsDto(row: NewsRowLike): NewsDto {
  return {
    id: row.id,
    title: row.title,
    excerpt: row.excerpt,
    body: row.body,
    category:
      row.category === 'Match Report' || row.category === 'Announcement'
        ? row.category
        : 'Club News',
    publishedAt: row.published_at,
    readMinutes: row.read_minutes,
    imageColors: pair(row.image_colors, [brand.primary, '#022C22']),
  };
}

type ProfileRowLike = Omit<ProfileRow, 'role'> & { role: string };

export function toProfileDto(row: ProfileRowLike): ProfileDto {
  return {
    id: row.id,
    email: row.email,
    fullName: row.full_name,
    role: row.role === 'admin' ? 'admin' : 'customer',
    phone: row.phone,
    joinedAt: row.created_at,
  };
}
