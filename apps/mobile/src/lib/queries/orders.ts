import { useMutation, useQuery, useQueryClient, type UseQueryOptions } from '@tanstack/react-query';
import type { OrderDto, OrderSeatDto } from '@kickoff/shared';
import { invokeFunction } from '@/lib/functions';
import { supabase } from '@/lib/supabase';

interface OrderSeatRow {
  seat_id: string;
  ticket_id: string | null;
  zone_name: string;
  row_label: string;
  number: number;
  price_satang: number;
}

interface OrderJoin {
  id: string;
  user_id: string;
  match_id: string;
  amount_satang: number;
  status: string;
  created_at: string;
  paid_at: string | null;
  payment_ref: string | null;
  checkout_url: string | null;
  expires_at: string | null;
  order_seats: OrderSeatRow[];
  matches: { opponent: string } | null;
}

const STATUSES = ['pending', 'paid', 'failed', 'cancelled', 'refunded'] as const;

function mapOrder(row: OrderJoin): OrderDto {
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
    matchLabel: `KickOff vs ${row.matches?.opponent ?? 'opponent'}`,
    seats,
    amountSatang: row.amount_satang,
    status: (STATUSES as readonly string[]).includes(row.status)
      ? (row.status as OrderDto['status'])
      : 'pending',
    createdAt: row.created_at,
    paidAt: row.paid_at,
    paymentRef: row.payment_ref,
    checkoutUrl: row.checkout_url,
    expiresAt: row.expires_at,
  };
}

const SELECT = '*, order_seats(seat_id,ticket_id,zone_name,row_label,number,price_satang), matches(opponent)';

export function useOrders(
  options: {
    /** Poll while returning from Stripe and waiting for the webhook. */
    refetchInterval?: UseQueryOptions<OrderDto[]>['refetchInterval'];
  } = {},
) {
  return useQuery({
    queryKey: ['orders'],
    refetchInterval: options.refetchInterval ?? false,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('orders')
        .select(SELECT)
        .order('created_at', { ascending: false });
      if (error) throw new Error(error.message);
      return ((data ?? []) as unknown as OrderJoin[]).map(mapOrder);
    },
  });
}

export function useOrder(
  id: string | undefined,
  options: {
    /** Poll while an order is waiting for the Stripe webhook to confirm it. */
    refetchInterval?: UseQueryOptions<OrderDto>['refetchInterval'];
  } = {},
) {
  return useQuery({
    queryKey: ['order', id],
    enabled: Boolean(id),
    refetchInterval: options.refetchInterval ?? false,
    queryFn: async () => {
      const { data, error } = await supabase.from('orders').select(SELECT).eq('id', id!).single();
      if (error) throw new Error(error.message);
      return mapOrder(data as unknown as OrderJoin);
    },
  });
}

export interface CheckoutResult {
  url: string;
  orderId: string;
  sessionId: string;
}

export function useCreateOrder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (holdId: string) =>
      invokeFunction<CheckoutResult>('stripe-checkout', { method: 'POST', body: { holdId } }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['orders'] });
      void queryClient.invalidateQueries({ queryKey: ['tickets'] });
      // create_order_from_hold flips the seats to 'held' and releases the raw
      // hold rows — the seat map (staleTime 60s) must not keep showing
      // "available" for seats this fan just reserved.
      void queryClient.invalidateQueries({ queryKey: ['seats'] });
      void queryClient.invalidateQueries({ queryKey: ['my-holds'] });
      void queryClient.invalidateQueries({ queryKey: ['zone-availability'] });
    },
  });
}

export interface PendingOrderSeat {
  seatId: string;
  orderId: string;
  expiresAt: string | null;
  checkoutUrl: string | null;
}

/**
 * The signed-in fan's own pending orders for a fixture, flattened to one entry
 * per seat (RLS scopes `orders` to the owner). The seat map renders these as
 * "Reserved by you" with resume/cancel actions instead of a cryptic refusal.
 */
export function usePendingOrderSeats(
  matchId: string | undefined,
  options: {
    /** Poll alongside the seat map so freed seats lose their gold overlay. */
    refetchInterval?: UseQueryOptions<PendingOrderSeat[]>['refetchInterval'];
  } = {},
) {
  return useQuery({
    queryKey: ['orders', 'pending-seats', matchId],
    enabled: Boolean(matchId),
    refetchInterval: options.refetchInterval ?? false,
    queryFn: async (): Promise<PendingOrderSeat[]> => {
      const { data, error } = await supabase
        .from('orders')
        .select('id, expires_at, checkout_url, order_seats(seat_id)')
        .eq('match_id', matchId!)
        .eq('status', 'pending');
      if (error) throw new Error(error.message);
      const rows = (data ?? []) as unknown as {
        id: string;
        expires_at: string | null;
        checkout_url: string | null;
        order_seats: { seat_id: string }[] | null;
      }[];
      return rows.flatMap((order) =>
        (order.order_seats ?? []).map((seat) => ({
          seatId: seat.seat_id,
          orderId: order.id,
          expiresAt: order.expires_at,
          checkoutUrl: order.checkout_url,
        })),
      );
    },
  });
}

export function useCancelOrder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (orderId: string) =>
      invokeFunction<{ cancelled: boolean; orderId: string; status: string }>('cancel-order', {
        method: 'POST',
        body: { orderId },
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['orders'] });
      void queryClient.invalidateQueries({ queryKey: ['seats'] });
      void queryClient.invalidateQueries({ queryKey: ['tickets'] });
      void queryClient.invalidateQueries({ queryKey: ['zone-availability'] });
    },
  });
}
