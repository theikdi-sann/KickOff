"use client";

import {
  decodeTicketQr,
  makeMockId,
  mockMatches,
  mockNews,
  mockZones,
  seedOrders,
  seedTickets,
  ticketFromQr,
  type Match,
  type NewsItem,
  type Order,
  type Profile,
  type ScanResult,
  type Ticket,
  type Zone,
} from "@xclub/shared";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

const STORAGE_KEY = "xclub.admin.state.v1";

interface AdminState {
  profile: Profile | null;
  matches: Match[];
  zones: Zone[];
  news: NewsItem[];
  orders: Order[];
  tickets: Ticket[];
  usedTicketIds: string[];
}

interface AdminContextValue extends AdminState {
  hydrated: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => void;
  addMatch: (input: MatchInput) => Match;
  updateMatch: (id: string, patch: Partial<Match>) => void;
  deleteMatch: (id: string) => void;
  updateZone: (id: string, patch: Partial<Zone>) => void;
  addZone: (matchId: string) => Zone;
  deleteZone: (id: string) => void;
  addNews: (input: NewsInput) => void;
  updateNews: (id: string, patch: Partial<NewsItem>) => void;
  deleteNews: (id: string) => void;
  validateTicket: (raw: string) => ScanResult;
  resetDemo: () => void;
}

export interface MatchInput {
  opponent: string;
  opponentShort: string;
  kickoffAt: string;
  venue: string;
  competition: string;
  homeAway: "home" | "away";
}

export interface NewsInput {
  title: string;
  excerpt: string;
  body: string;
  category: NewsItem["category"];
}

const demoAdminProfile: Profile = {
  id: "u-admin",
  email: "admin@xclub.app",
  fullName: "Club Operations",
  role: "admin",
  phone: "02 555 0188",
  initials: "CO",
  joinedAt: "2026-01-05T09:00:00+07:00",
};

const initialState: AdminState = {
  profile: null,
  matches: mockMatches,
  zones: mockZones,
  news: mockNews,
  orders: seedOrders,
  tickets: seedTickets,
  usedTicketIds: seedTickets.filter((ticket) => ticket.status === "used").map((ticket) => ticket.id),
};

const AdminContext = createContext<AdminContextValue | null>(null);

const palettes: [string, string][] = [
  ["#0B6B3A", "#052E1A"],
  ["#0F766E", "#042F2E"],
  ["#1E3A8A", "#0B1220"],
  ["#7C2D12", "#1C0A04"],
];

const accents = ["#F4C430", "#34D399", "#60A5FA", "#FB923C"];

export function AdminProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AdminState>(initialState);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<AdminState>;
        if (parsed && Array.isArray(parsed.matches)) {
          // Hydrate the client store from localStorage after mount to avoid SSR mismatch.
          // eslint-disable-next-line react-hooks/set-state-in-effect
          setState({
            profile: parsed.profile ?? null,
            matches: parsed.matches,
            zones: parsed.zones ?? mockZones,
            news: parsed.news ?? mockNews,
            orders: parsed.orders ?? seedOrders,
            tickets: parsed.tickets ?? seedTickets,
            usedTicketIds: parsed.usedTicketIds ?? [],
          });
        }
      }
    } catch {
      // Ignore corrupt storage and keep the demo seed.
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Storage can be unavailable in private mode.
    }
  }, [state, hydrated]);

  const signIn = useCallback(async (email: string, password: string) => {
    void password;
    setState((current) => ({
      ...current,
      profile: { ...demoAdminProfile, email: email.trim() || demoAdminProfile.email },
    }));
  }, []);

  const signOut = useCallback(() => {
    setState((current) => ({ ...current, profile: null }));
  }, []);

  const addMatch = useCallback((input: MatchInput) => {
    const id = makeMockId("m");
    const index = Math.floor(Math.random() * palettes.length);
    const match: Match = {
      id,
      ...input,
      status: "upcoming",
      posterColors: palettes[index],
      accent: accents[index],
    };
    const defaults: Array<Pick<Zone, "name" | "description" | "priceSatang" | "color" | "rows" | "seatsPerRow">> = [
      {
        name: "North Stand",
        description: "Behind the goal · loudest end",
        priceSatang: 35000,
        color: "#22C55E",
        rows: ["A", "B", "C", "D"],
        seatsPerRow: 12,
      },
      {
        name: "East Stand",
        description: "Side view · family friendly",
        priceSatang: 45000,
        color: "#F4C430",
        rows: ["A", "B", "C", "D"],
        seatsPerRow: 12,
      },
      {
        name: "VIP Pavilion",
        description: "Halfway line · padded seats",
        priceSatang: 85000,
        color: "#8B5CF6",
        rows: ["A", "B"],
        seatsPerRow: 10,
      },
    ];
    const zones: Zone[] = defaults.map((zone) => ({
      ...zone,
      id: `${id}-${zone.name.toLowerCase().replace(/\s+/g, "-")}`,
      matchId: id,
    }));
    setState((current) => ({
      ...current,
      matches: [match, ...current.matches],
      zones: [...current.zones, ...zones],
    }));
    return match;
  }, []);

  const updateMatch = useCallback((id: string, patch: Partial<Match>) => {
    setState((current) => ({
      ...current,
      matches: current.matches.map((match) => (match.id === id ? { ...match, ...patch } : match)),
    }));
  }, []);

  const deleteMatch = useCallback((id: string) => {
    setState((current) => ({
      ...current,
      matches: current.matches.filter((match) => match.id !== id),
      zones: current.zones.filter((zone) => zone.matchId !== id),
    }));
  }, []);

  const updateZone = useCallback((id: string, patch: Partial<Zone>) => {
    setState((current) => ({
      ...current,
      zones: current.zones.map((zone) => (zone.id === id ? { ...zone, ...patch } : zone)),
    }));
  }, []);

  const addZone = useCallback(
    (matchId: string) => {
      const zone: Zone = {
        id: makeMockId("z"),
        matchId,
        name: "New Stand",
        description: "Configure this zone",
        priceSatang: 40000,
        color: "#0EA5E9",
        rows: ["A", "B"],
        seatsPerRow: 10,
      };
      setState((current) => ({ ...current, zones: [...current.zones, zone] }));
      return zone;
    },
    [],
  );

  const deleteZone = useCallback((id: string) => {
    setState((current) => ({ ...current, zones: current.zones.filter((zone) => zone.id !== id) }));
  }, []);

  const addNews = useCallback((input: NewsInput) => {
    const article: NewsItem = {
      id: makeMockId("n"),
      ...input,
      publishedAt: new Date().toISOString(),
      readMinutes: Math.max(1, Math.round(input.body.split(/\s+/).length / 180)),
      imageColors: palettes[Math.floor(Math.random() * palettes.length)],
    };
    setState((current) => ({ ...current, news: [article, ...current.news] }));
  }, []);

  const updateNews = useCallback((id: string, patch: Partial<NewsItem>) => {
    setState((current) => ({
      ...current,
      news: current.news.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    }));
  }, []);

  const deleteNews = useCallback((id: string) => {
    setState((current) => ({ ...current, news: current.news.filter((item) => item.id !== id) }));
  }, []);

  const validateTicket = useCallback(
    (raw: string): ScanResult => {
      const decoded = decodeTicketQr(raw);
      if (!decoded.ok) {
        return {
          ok: false,
          code: "invalid",
          title: "Invalid pass",
          message: decoded.reason,
        };
      }
      const { payload } = decoded;
      const alreadyUsed = state.usedTicketIds.includes(payload.ticketId);
      if (alreadyUsed) {
        return {
          ok: false,
          code: "used",
          title: "Already scanned",
          message: `${payload.holder} · ${payload.zoneName} ${payload.seatLabel}. This pass has already entered the stadium.`,
          ticket: ticketFromQr(payload, "used"),
        };
      }

      const now = new Date().toISOString();
      const usedTicket: Ticket = {
        ...ticketFromQr(payload, "used"),
        usedAt: now,
      };
      setState((current) => {
        const exists = current.tickets.some((ticket) => ticket.id === payload.ticketId);
        return {
          ...current,
          usedTicketIds: [...current.usedTicketIds, payload.ticketId],
          tickets: exists
            ? current.tickets.map((ticket) =>
                ticket.id === payload.ticketId ? { ...ticket, status: "used", usedAt: now } : ticket,
              )
            : [usedTicket, ...current.tickets],
        };
      });

      return {
        ok: true,
        code: "valid",
        title: "Entry approved",
        message: `${payload.holder} · ${payload.zoneName} · Row ${payload.row} · Seat ${payload.number}. Marked as used.`,
        ticket: { ...ticketFromQr(payload, "valid"), usedAt: now },
      };
    },
    [state.usedTicketIds],
  );

  const resetDemo = useCallback(() => {
    setState({ ...initialState, profile: demoAdminProfile });
  }, []);

  const value = useMemo<AdminContextValue>(
    () => ({
      ...state,
      hydrated,
      signIn,
      signOut,
      addMatch,
      updateMatch,
      deleteMatch,
      updateZone,
      addZone,
      deleteZone,
      addNews,
      updateNews,
      deleteNews,
      validateTicket,
      resetDemo,
    }),
    [
      state,
      hydrated,
      signIn,
      signOut,
      addMatch,
      updateMatch,
      deleteMatch,
      updateZone,
      addZone,
      deleteZone,
      addNews,
      updateNews,
      deleteNews,
      validateTicket,
      resetDemo,
    ],
  );

  return <AdminContext.Provider value={value}>{children}</AdminContext.Provider>;
}

export function useAdmin(): AdminContextValue {
  const value = useContext(AdminContext);
  if (!value) throw new Error("useAdmin must be used inside AdminProvider");
  return value;
}
