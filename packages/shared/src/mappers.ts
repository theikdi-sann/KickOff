/**
 * Row → wire DTO mappers. Kept in shared so both apps map Supabase rows the
 * same way (snake_case columns → camelCase payloads).
 */
import type {
  MatchDto,
  NewsDto,
  ProfileDto,
  SeatDto,
  ZoneDto,
} from './dto';
import type {
  MatchRow,
  NewsItemRow,
  ProfileRow,
  SeatRow,
  ZoneRow,
} from './entities';

function pair(colors: string[] | null, fallback: [string, string]): [string, string] {
  return [colors?.[0] ?? fallback[0], colors?.[1] ?? fallback[1]];
}

type MatchRowLike = Omit<MatchRow, 'home_away'> & { home_away: string };

export function toMatchDto(row: MatchRowLike): MatchDto {
  return {
    id: row.id,
    opponent: row.opponent,
    opponentShort: row.opponent_short,
    kickoffAt: row.kickoff_at,
    venue: row.venue,
    competition: row.competition,
    homeAway: row.home_away === 'away' ? 'away' : 'home',
    status: row.status,
    homeScore: row.home_score,
    awayScore: row.away_score,
    posterColors: pair(row.poster_colors, ['#0B6B3A', '#052E1A']),
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
    imageColors: pair(row.image_colors, ['#0B6B3A', '#022C22']),
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
