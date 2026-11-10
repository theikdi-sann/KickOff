import { useQuery } from '@tanstack/react-query';
import type { TicketDto } from '@kickoff/shared';
import { api } from '@/lib/api';
import { supabase } from '@/lib/supabase';

interface TicketJoin {
  id: string;
  order_id: string;
  match_id: string;
  status: string;
  issued_at: string;
  used_at: string | null;
  matches: { opponent: string; kickoff_at: string; venue: string } | null;
  seats: { row_label: string; number: number; zones: { name: string } | null } | null;
  order_seats: { price_satang: number } | null;
}

const STATUSES = ['valid', 'used', 'void'] as const;

function mapTicket(row: TicketJoin, holder: string): TicketDto {
  const seat = row.seats;
  const rowLabel = seat?.row_label ?? '';
  const number = seat?.number ?? 0;

  return {
    id: row.id,
    orderId: row.order_id,
    matchId: row.match_id,
    matchLabel: `KickOff vs ${row.matches?.opponent ?? 'opponent'}`,
    opponent: row.matches?.opponent ?? '',
    kickoffAt: row.matches?.kickoff_at ?? '',
    venue: row.matches?.venue ?? 'KickOff Arena',
    holder,
    zoneId: '',
    zoneName: seat?.zones?.name ?? '',
    row: rowLabel,
    number,
    seatLabel: `${rowLabel}${number}`,
    priceSatang: row.order_seats?.price_satang ?? 0,
    status: (STATUSES as readonly string[]).includes(row.status)
      ? (row.status as TicketDto['status'])
      : 'void',
    issuedAt: row.issued_at,
    usedAt: row.used_at,
    qrPayload: '',
  };
}

const SELECT =
  'id,order_id,match_id,status,issued_at,used_at,matches(opponent,kickoff_at,venue),seats(row_label,number,zones(name)),order_seats!tickets_order_seat_id_fkey(price_satang)';

async function holderName(): Promise<string> {
  const { data } = await supabase.auth.getUser();
  const metadataName = data.user?.user_metadata?.full_name;
  return typeof metadataName === 'string' && metadataName.length > 0
    ? metadataName
    : data.user?.email ?? 'KickOff fan';
}

export function useTickets() {
  return useQuery({
    queryKey: ['tickets'],
    queryFn: async () => {
      const [holder, result] = await Promise.all([
        holderName(),
        supabase.from('tickets').select(SELECT).order('issued_at', { ascending: false }),
      ]);
      if (result.error) throw new Error(result.error.message);
      return ((result.data ?? []) as unknown as TicketJoin[]).map((row) => mapTicket(row, holder));
    },
  });
}

export function useTicket(id: string | undefined) {
  return useQuery({
    queryKey: ['ticket', id],
    enabled: Boolean(id),
    queryFn: async () => {
      const [holder, result] = await Promise.all([
        holderName(),
        supabase.from('tickets').select(SELECT).eq('id', id!).single(),
      ]);
      if (result.error) throw new Error(result.error.message);
      return mapTicket(result.data as unknown as TicketJoin, holder);
    },
  });
}

export interface TicketQrPayload {
  qrPayload: string;
  version: number;
  status: string;
}

/**
 * Fetches the short-lived signed V2 payload from `ticket-qr`. The ticket row
 * itself never exposes the QR, so the pass stays server-signed.
 */
export function useTicketQr(id: string | undefined) {
  return useQuery({
    queryKey: ['ticket-qr', id],
    enabled: Boolean(id),
    staleTime: 60_000,
    queryFn: () => api.post<TicketQrPayload>('ticket-qr', { ticketId: id! }),
  });
}
