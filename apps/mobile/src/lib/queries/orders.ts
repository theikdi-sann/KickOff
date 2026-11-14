import { useMutation, useQuery, useQueryClient, type UseQueryOptions } from '@tanstack/react-query';
import { requireDefined, toOrderDto, type OrderDto, type OrderJoinRow } from '@kickoff/shared';
import { invokeFunction } from '@/lib/functions';
import { supabase } from '@/lib/supabase';

const SELECT = '*, order_seats(seat_id,ticket_id,zone_name,row_label,number,price_minor_units), matches(opponent)';

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
      return ((data ?? []) as unknown as OrderJoinRow[]).map(toOrderDto);
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
      const { data, error } = await supabase
        .from('orders')
        .select(SELECT)
        .eq('id', requireDefined(id, 'order id'))
        .single();
      if (error) throw new Error(error.message);
      return toOrderDto(data as unknown as OrderJoinRow);
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
      // The pending order's lines now claim the seats, so the raw seat rows,
      // the derived "taken" set (keyed under 'seats') and the availability
      // counts must all refresh.
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
        .eq('match_id', requireDefined(matchId, 'match id'))
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
