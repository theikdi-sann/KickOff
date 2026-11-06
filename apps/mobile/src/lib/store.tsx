import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  demoCustomer,
  makeMockId,
  seedOrders,
  seedTickets,
  type Match,
  type Order,
  type Profile,
  type Seat,
  type Ticket,
  type Zone,
  buildTicketQr,
} from '@xclub/shared';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

const STORAGE_KEY = 'xclub.mock.state.v1';

interface StoredState {
  profile: Profile | null;
  tickets: Ticket[];
  orders: Order[];
}

interface PurchaseInput {
  match: Match;
  zone: Zone;
  seats: Seat[];
  holder: string;
}

interface AppContextValue {
  hydrated: boolean;
  profile: Profile | null;
  tickets: Ticket[];
  orders: Order[];
  signIn: (email: string, password: string) => Promise<void>;
  signInDemo: () => Promise<void>;
  signUp: (fullName: string, email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  purchase: (input: PurchaseInput) => Promise<{ order: Order; tickets: Ticket[] }>;
  takenSeatIds: (matchId: string) => string[];
  getTicket: (id: string) => Ticket | undefined;
  getOrder: (id: string) => Order | undefined;
}

const AppContext = createContext<AppContextValue | null>(null);

const initialState: StoredState = {
  profile: null,
  tickets: seedTickets,
  orders: seedOrders,
};

function makeProfile(fullName: string, email: string): Profile {
  const initials = fullName
    .split(' ')
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .slice(0, 2)
    .join('');
  return {
    id: makeMockId('u'),
    email,
    fullName,
    role: 'customer',
    phone: '080 000 0000',
    initials: initials || 'XC',
    joinedAt: new Date().toISOString(),
  };
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<StoredState>(initialState);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (!active || !raw) return;
        const parsed = JSON.parse(raw) as StoredState;
        if (parsed && Array.isArray(parsed.tickets) && Array.isArray(parsed.orders)) {
          setState({
            profile: parsed.profile ?? null,
            tickets: parsed.tickets,
            orders: parsed.orders,
          });
        }
      })
      .catch(() => undefined)
      .finally(() => {
        if (active) setHydrated(true);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state)).catch(() => undefined);
  }, [state, hydrated]);

  const signIn = useCallback(async (email: string, _password: string) => {
    const profile = {
      ...demoCustomer,
      email: email.trim() || demoCustomer.email,
      initials: demoCustomer.initials,
    };
    setState((current) => ({ ...current, profile }));
  }, []);

  const signInDemo = useCallback(async () => {
    setState((current) => ({ ...current, profile: demoCustomer }));
  }, []);

  const signUp = useCallback(async (fullName: string, email: string, _password: string) => {
    setState((current) => ({ ...current, profile: makeProfile(fullName, email) }));
  }, []);

  const signOut = useCallback(async () => {
    setState((current) => ({ ...current, profile: null }));
  }, []);

  const purchase = useCallback(
    async ({ match, zone, seats, holder }: PurchaseInput) => {
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
        userId: state.profile?.id ?? 'demo',
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
        ...current,
        tickets: [...tickets, ...current.tickets],
        orders: [order, ...current.orders],
      }));

      return { order, tickets };
    },
    [state.profile],
  );

  const takenSeatIds = useCallback(
    (matchId: string) => {
      return state.tickets
        .filter((ticket) => ticket.matchId === matchId && ticket.status !== 'void')
        .map((ticket) => `${ticket.zoneId}-${ticket.row}${ticket.number}`);
    },
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

  const value = useMemo<AppContextValue>(
    () => ({
      hydrated,
      profile: state.profile,
      tickets: state.tickets,
      orders: state.orders,
      signIn,
      signInDemo,
      signUp,
      signOut,
      purchase,
      takenSeatIds,
      getTicket,
      getOrder,
    }),
    [hydrated, state, signIn, signInDemo, signUp, signOut, purchase, takenSeatIds, getTicket, getOrder],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const value = useContext(AppContext);
  if (!value) throw new Error('useApp must be used inside AppProvider');
  return value;
}
