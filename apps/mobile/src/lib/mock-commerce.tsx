/**
 * @deprecated Phase A mock commerce (tickets/orders/purchase). Screens migrate to
 * Supabase queries in Phases 6–10 and this provider is deleted with the mock layer.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  buildTicketQr,
  demoCustomer,
  makeMockId,
  seedOrders,
  seedTickets,
  type Match,
  type Order,
  type Seat,
  type Ticket,
  type Zone,
} from '@xclub/shared';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

const STORAGE_KEY = 'xclub.mock.commerce.v1';

interface CommerceState {
  tickets: Ticket[];
  orders: Order[];
}

interface PurchaseInput {
  match: Match;
  zone: Zone;
  seats: Seat[];
  holder: string;
}

interface MockCommerceValue {
  tickets: Ticket[];
  orders: Order[];
  purchase: (input: PurchaseInput) => Promise<{ order: Order; tickets: Ticket[] }>;
  takenSeatIds: (matchId: string) => string[];
  getTicket: (id: string) => Ticket | undefined;
  getOrder: (id: string) => Order | undefined;
}

const MockCommerceContext = createContext<MockCommerceValue | null>(null);

const initialState: CommerceState = {
  tickets: seedTickets,
  orders: seedOrders,
};

export function MockCommerceProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<CommerceState>(initialState);

  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (!active || !raw) return;
        const parsed = JSON.parse(raw) as CommerceState;
        if (parsed && Array.isArray(parsed.tickets) && Array.isArray(parsed.orders)) {
          setState({ tickets: parsed.tickets, orders: parsed.orders });
        }
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state)).catch(() => undefined);
  }, [state]);

  const purchase = useCallback(async ({ match, zone, seats, holder }: PurchaseInput) => {
    const now = new Date().toISOString();
    const orderId = makeMockId('ord');
    const paymentRef = makeMockId('pi_mock');
    const tickets: Ticket[] = seats.map((seat) => {
      const base: Omit<Ticket, 'qrPayload'> = {
        id: makeMockId('tkt'),
        orderId,
        matchId: match.id,
        matchLabel: `XClub vs ${match.opponent}`,
        opponent: match.opponent,
        kickoffAt: match.kickoffAt,
        venue: match.venue,
        holder,
        zoneId: zone.id,
        zoneName: zone.name,
        row: seat.row,
        number: seat.number,
        seatLabel: seat.label,
        priceSatang: zone.priceSatang,
        status: 'valid',
        issuedAt: now,
      };
      return { ...base, qrPayload: buildTicketQr(base) };
    });

    const order: Order = {
      id: orderId,
      userId: demoCustomer.id,
      matchId: match.id,
      matchLabel: `XClub vs ${match.opponent}`,
      seats: tickets.map((ticket) => ({
        ticketId: ticket.id,
        zoneId: zone.id,
        zoneName: zone.name,
        row: ticket.row,
        number: ticket.number,
        priceSatang: zone.priceSatang,
      })),
      amountSatang: zone.priceSatang * seats.length,
      status: 'paid',
      createdAt: now,
      paymentRef,
    };

    setState((current) => ({
      tickets: [...tickets, ...current.tickets],
      orders: [order, ...current.orders],
    }));

    return { order, tickets };
  }, []);

  const takenSeatIds = useCallback(
    (matchId: string) =>
      state.tickets
        .filter((ticket) => ticket.matchId === matchId && ticket.status !== 'void')
        .map((ticket) => `${ticket.zoneId}-${ticket.row}${ticket.number}`),
    [state.tickets],
  );

  const getTicket = useCallback(
    (id: string) => state.tickets.find((ticket) => ticket.id === id),
    [state.tickets],
  );

  const getOrder = useCallback(
    (id: string) => state.orders.find((order) => order.id === id),
    [state.orders],
  );

  const value = useMemo<MockCommerceValue>(
    () => ({
      tickets: state.tickets,
      orders: state.orders,
      purchase,
      takenSeatIds,
      getTicket,
      getOrder,
    }),
    [state, purchase, takenSeatIds, getTicket, getOrder],
  );

  return <MockCommerceContext.Provider value={value}>{children}</MockCommerceContext.Provider>;
}

export function useMockCommerce(): MockCommerceValue {
  const value = useContext(MockCommerceContext);
  if (!value) throw new Error('useMockCommerce must be used inside MockCommerceProvider');
  return value;
}
