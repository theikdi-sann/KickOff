import { useQuery } from '@tanstack/react-query';
import { requireDefined, toTicketDto, type TicketDto, type TicketJoinRow } from '@kickoff/shared';
import { api } from '@/lib/api';
import { cachePass, cacheTicket, readPass, readTicket } from '@/lib/pass-cache';
import { supabase } from '@/lib/supabase';

const SELECT =
  'id,order_id,match_id,status,issued_at,used_at,matches(opponent,kickoff_at,venue:venues(name)),seats(row_label,number,zones(name)),order_seats!tickets_order_seat_id_fkey(price_minor_units)';

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

export interface CachedTicket extends TicketDto {
  /** True when the row came from this device's cache, not the network. */
  fromCache: boolean;
}

export function useTicket(id: string | undefined) {
  return useQuery({
    queryKey: ['ticket', id],
    enabled: Boolean(id),
    queryFn: async () => {
      const ticketId = requireDefined(id, 'ticket id');
      try {
        const [holder, result] = await Promise.all([
          holderName(),
          supabase.from('tickets').select(SELECT).eq('id', ticketId).single(),
        ]);
        if (result.error) throw new Error(result.error.message);
        const ticket = toTicketDto(result.data as unknown as TicketJoinRow, holder);
        await cacheTicket(ticketId, ticket);
        return { ...ticket, fromCache: false };
      } catch (error) {
        // Offline (GAP-01): the row this device last saw renders the pass —
        // the hint on screen says so, and the gate still decides at scan time.
        const cached = await readTicket<TicketDto>(ticketId);
        if (cached) return { ...cached, fromCache: true };
        throw error;
      }
    },
  });
}

export interface TicketQrPayload {
  qrPayload: string;
  version: number;
  status: string;
}

export interface TicketQrView {
  /** The signed bytes — served verbatim from the cache when offline. */
  qrPayload: string;
  /** Only present on a live response; the cache records bytes, not metadata. */
  version?: number;
  status?: string;
  /** True when this came from this device's cache, not the network. */
  fromCache: boolean;
}

/**
 * Fetches the short-lived signed V2 payload from `ticket-qr`. The ticket row
 * itself never exposes the QR, so the pass stays server-signed.
 *
 * Offline (GAP-01) the last payload this device received is served instead —
 * the same bytes, never re-encoded — and flagged `fromCache` so the screen
 * can admit it. The scan stays server-authoritative either way.
 */
export function useTicketQr(id: string | undefined) {
  return useQuery({
    queryKey: ['ticket-qr', id],
    enabled: Boolean(id),
    staleTime: 60_000,
    queryFn: async () => {
      const ticketId = requireDefined(id, 'ticket id');
      try {
        const result = await api.post<TicketQrPayload>('ticket-qr', { ticketId });
        await cachePass(ticketId, result.qrPayload);
        return { ...result, fromCache: false };
      } catch (error) {
        const cached = await readPass(ticketId);
        if (cached) return { qrPayload: cached, fromCache: true };
        throw error;
      }
    },
  });
}
