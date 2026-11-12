import { useQuery } from '@tanstack/react-query';
import { toTicketDto, type TicketJoinRow } from '@kickoff/shared';
import { api } from '@/lib/api';
import { supabase } from '@/lib/supabase';

const SELECT =
  'id,order_id,match_id,status,issued_at,used_at,matches(opponent,kickoff_at,venue:venues(name)),seats(row_label,number,zones(name)),order_seats!tickets_order_seat_id_fkey(price_satang)';

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
      return ((result.data ?? []) as unknown as TicketJoinRow[]).map((row) => toTicketDto(row, holder));
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
      return toTicketDto(result.data as unknown as TicketJoinRow, holder);
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
