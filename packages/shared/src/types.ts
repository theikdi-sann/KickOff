export type Role = 'customer' | 'admin';
export type MatchStatus = 'upcoming' | 'completed' | 'live';
export type TicketStatus = 'valid' | 'used' | 'void';
export type OrderStatus = 'paid' | 'pending' | 'failed';

export interface Profile {
  id: string;
  email: string;
  fullName: string;
  role: Role;
  phone?: string;
  initials: string;
  joinedAt: string;
}

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

export type SeatStatus = 'available' | 'sold' | 'held';

export interface Seat {
  id: string;
  zoneId: string;
  row: string;
  number: number;
  label: string;
  status: SeatStatus;
}

export interface NewsItem {
  id: string;
  title: string;
  excerpt: string;
  body: string;
  category: 'Club News' | 'Match Report' | 'Announcement';
  publishedAt: string;
  readMinutes: number;
  imageColors: [string, string];
}

export interface OrderSeat {
  ticketId: string;
  zoneId: string;
  zoneName: string;
  row: string;
  number: number;
  priceSatang: number;
}

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

export interface ScanResult {
  ok: boolean;
  code: 'valid' | 'used' | 'invalid' | 'wrong_match';
  title: string;
  message: string;
  ticket?: Ticket;
}

export interface DemoSession {
  profile: Profile;
  signedInAt: string;
}

export interface BookingSelection {
  matchId: string;
  zoneId: string;
  seatIds: string[];
}
