/**
 * @deprecated Phase A mock data layer. Kept only until every screen moves onto
 * Supabase (P10c-02). `npm run check:no-mocks` fails while app sources import
 * anything from this module.
 */
import type { Match, NewsItem, Order, Seat, Ticket, Zone } from './types';
import { palette } from './theme';
import { buildTicketQr } from './qr';

export const CLUB_NAME = 'XClub';
export const CLUB_TAGLINE = 'Your digital ticket to match day.';
export const STADIUM = 'XClub Arena';
export const COMPETITION = 'Thai Premier League';

const makeMatch = (
  id: string,
  opponent: string,
  short: string,
  kickoffAt: string,
  colors: [string, string],
  accent: string,
  extra: Partial<Match> = {},
): Match => ({
  id,
  opponent,
  opponentShort: short,
  kickoffAt,
  venue: STADIUM,
  competition: COMPETITION,
  homeAway: 'home',
  status: 'upcoming',
  posterColors: colors,
  accent,
  ...extra,
});

/** @deprecated Phase A mock data — removed in P10c-02. */
export const mockMatches: Match[] = [
  makeMatch('m-bkk', 'Bangkok Rovers', 'BKR', '2026-11-14T18:00:00+07:00', ['#0B6B3A', '#052E1A'], '#F4C430'),
  makeMatch('m-cmi', 'Chiang Mai FC', 'CMI', '2026-11-21T19:30:00+07:00', ['#065F46', '#022C22'], '#34D399'),
  makeMatch('m-hkt', 'Phuket United', 'PKT', '2026-11-28T17:00:00+07:00', ['#1E3A8A', '#0B1220'], '#60A5FA'),
  makeMatch('m-kkn', 'Khon Kaen Athletic', 'KKA', '2026-12-05T20:00:00+07:00', ['#7C2D12', '#1C0A04'], '#FB923C'),
  makeMatch('m-ryg', 'Rayong City', 'RYG', '2026-10-25T18:00:00+07:00', ['#334155', '#0F172A'], '#94A3B8', {
    status: 'completed',
    homeScore: 1,
    awayScore: 0,
  }),
  makeMatch('m-npt', 'Nakhon Pathom', 'NPT', '2026-10-18T19:00:00+07:00', ['#3F3F46', '#18181B'], '#A1A1AA', {
    status: 'completed',
    homeScore: 2,
    awayScore: 2,
  }),
];

const zoneTemplates = [
  {
    key: 'north',
    name: 'North Stand',
    description: 'Behind the goal · loudest end',
    priceSatang: 35000,
    color: '#22C55E',
    rows: ['A', 'B', 'C', 'D', 'E', 'F'],
    seatsPerRow: 12,
  },
  {
    key: 'east',
    name: 'East Stand',
    description: 'Side view · family friendly',
    priceSatang: 45000,
    color: '#F4C430',
    rows: ['A', 'B', 'C', 'D', 'E', 'F'],
    seatsPerRow: 12,
  },
  {
    key: 'vip',
    name: 'VIP Pavilion',
    description: 'Halfway line · padded seats',
    priceSatang: 85000,
    color: '#8B5CF6',
    rows: ['A', 'B', 'C', 'D'],
    seatsPerRow: 10,
  },
] as const;

/** @deprecated Phase A mock data — removed in P10c-02. */
export const mockZones: Zone[] = mockMatches
  .filter((match) => match.status === 'upcoming')
  .flatMap((match) =>
    zoneTemplates.map((zone) => ({
      id: `${match.id}-${zone.key}`,
      matchId: match.id,
      name: zone.name,
      description: zone.description,
      priceSatang: zone.priceSatang,
      color: zone.color,
      rows: [...zone.rows],
      seatsPerRow: zone.seatsPerRow,
    })),
  );

function hash(input: string): number {
  let value = 0;
  for (let i = 0; i < input.length; i += 1) {
    value = (value * 31 + input.charCodeAt(i)) % 1009;
  }
  return value;
}

/** @deprecated Phase A mock data — removed in P10c-02. */
export function buildSeatMap(zone: Zone): Seat[] {
  const seats: Seat[] = [];
  for (const row of zone.rows) {
    for (let number = 1; number <= zone.seatsPerRow; number += 1) {
      const id = `${zone.id}-${row}${number}`;
      const badge = hash(id);
      seats.push({
        id,
        zoneId: zone.id,
        row,
        number,
        label: `${row}${number}`,
        status: badge % 7 === 0 || badge % 11 === 0 ? 'sold' : 'available',
      });
    }
  }
  return seats;
}

/** @deprecated Phase A mock data — removed in P10c-02. */
export function seatsForZone(zoneId: string): Seat[] {
  const zone = mockZones.find((item) => item.id === zoneId);
  return zone ? buildSeatMap(zone) : [];
}

/** @deprecated Phase A mock data — removed in P10c-02. */
export function zoneAvailability(zone: Zone): { available: number; total: number } {
  const seats = buildSeatMap(zone);
  return {
    total: seats.length,
    available: seats.filter((seat) => seat.status === 'available').length,
  };
}

/** @deprecated Phase A mock data — removed in P10c-02. */
export function minimumPrice(matchId: string): number {
  const zones = mockZones.filter((zone) => zone.matchId === matchId);
  if (zones.length === 0) return 0;
  return zones.reduce((min, zone) => Math.min(min, zone.priceSatang), zones[0].priceSatang);
}

/** @deprecated Phase A mock data — removed in P10c-02. */
export const mockNews: NewsItem[] = [
  {
    id: 'n-matchday',
    title: 'Matchday guide: Bangkok Rovers at the Arena',
    excerpt: 'Gates open at 16:30. Here is everything you need for a smooth afternoon in the North Stand.',
    category: 'Club News',
    publishedAt: '2026-11-04T10:00:00+07:00',
    readMinutes: 3,
    imageColors: ['#0B6B3A', '#022C22'],
    body: 'The XClub Arena gates open two hours before kick-off on Saturday. Supporters are encouraged to arrive early, keep their digital ticket open, and use the East Stand entrance if the North queue is busy.\n\nOur new food court is open behind the East Stand with six local vendors. Bag checks are in operation at every gate, and the family section is strictly alcohol-free.\n\nA limited number of North Stand tickets remain available online. Away supporters should enter through Gate 4.',
  },
  {
    id: 'n-report',
    title: 'Three points on the road',
    excerpt: 'A second-half header from captain Niran Seetoo settled a scrappy away fixture in Rayong.',
    category: 'Match Report',
    publishedAt: '2026-10-26T09:30:00+07:00',
    readMinutes: 4,
    imageColors: ['#1E293B', '#0F172A'],
    body: 'XClub returned from the coast with all three points after a disciplined second-half display. The only goal arrived in the 67th minute when Niran Seetoo met a whipped corner at the near post.\n\nThe back four held firm through five minutes of stoppage time, with goalkeeper Anan Prasert making a smart low save to protect the clean sheet.\n\nNext up is a home fixture against Bangkok Rovers, with tickets available now.',
  },
  {
    id: 'n-food',
    title: 'New East Stand food court opens',
    excerpt: 'Six local vendors, shorter queues, and a dedicated family seating area are ready for Saturday.',
    category: 'Announcement',
    publishedAt: '2026-10-23T14:00:00+07:00',
    readMinutes: 2,
    imageColors: ['#854D0E', '#422006'],
    body: 'The new East Stand food court will open for the first time on Saturday. Six local vendors will serve everything from grilled chicken to boat noodles, with contactless payment at every counter.\n\nThe concourse has been widened to improve flow, and a dedicated family seating area now sits directly behind the East Stand turnstiles. Season parking passes remain valid, but supporters are encouraged to use the shuttle from the north car park.',
  },
  {
    id: 'n-academy',
    title: 'Academy duo sign first professional contracts',
    excerpt: 'Two homegrown midfielders have committed their futures to XClub after standout seasons.',
    category: 'Club News',
    publishedAt: '2026-10-20T11:15:00+07:00',
    readMinutes: 3,
    imageColors: ['#065F46', '#022C22'],
    body: 'XClub is delighted to announce that academy midfielders Punn and Kiet have signed their first professional contracts. Both players have trained regularly with the first team this season and will be part of the matchday squad after the international break.\n\nThe club believes in a clear pathway from the academy to the first team, and the pair are the latest examples of that commitment.',
  },
];

/** @deprecated Phase A mock data — removed in P10c-02. */
export const demoCustomer = {
  id: 'u-fan',
  email: 'fan@xclub.app',
  fullName: 'Nara Chaiyaporn',
  role: 'customer' as const,
  phone: '081 234 5678',
  initials: 'NC',
  joinedAt: '2026-08-12T09:00:00+07:00',
};

/** @deprecated Phase A mock data — removed in P10c-02. */
export const demoAdmin = {
  id: 'u-admin',
  email: 'admin@xclub.app',
  fullName: 'Club Operations',
  role: 'admin' as const,
  phone: '02 555 0188',
  initials: 'CO',
  joinedAt: '2026-01-05T09:00:00+07:00',
};

/** @deprecated Phase A mock data — removed in P10c-02. */
export const seedOrders: Order[] = [
  {
    id: 'ord-demo-1',
    userId: 'u-fan',
    matchId: 'm-bkk',
    matchLabel: 'XClub vs Bangkok Rovers',
    seats: [
      {
        ticketId: 'tkt-demo-1',
        zoneId: 'm-bkk-north',
        zoneName: 'North Stand',
        row: 'C',
        number: 7,
        priceSatang: 35000,
      },
    ],
    amountSatang: 35000,
    status: 'paid',
    createdAt: '2026-11-01T12:20:00+07:00',
    paymentRef: 'pi_mock_8f21a',
  },
  {
    id: 'ord-demo-used',
    userId: 'u-fan',
    matchId: 'm-ryg',
    matchLabel: 'XClub vs Rayong City',
    seats: [
      {
        ticketId: 'tkt-demo-used',
        zoneId: 'm-ryg-east',
        zoneName: 'East Stand',
        row: 'B',
        number: 11,
        priceSatang: 45000,
      },
    ],
    amountSatang: 45000,
    status: 'paid',
    createdAt: '2026-10-20T09:10:00+07:00',
    paymentRef: 'pi_mock_71c3d',
  },
];

const seedTicketBase: Omit<Ticket, 'qrPayload'> = {
  id: 'tkt-demo-1',
  orderId: 'ord-demo-1',
  matchId: 'm-bkk',
  matchLabel: 'XClub vs Bangkok Rovers',
  opponent: 'Bangkok Rovers',
  kickoffAt: '2026-11-14T18:00:00+07:00',
  venue: STADIUM,
  holder: demoCustomer.fullName,
  zoneId: 'm-bkk-north',
  zoneName: 'North Stand',
  row: 'C',
  number: 7,
  seatLabel: 'C7',
  priceSatang: 35000,
  status: 'valid',
  issuedAt: '2026-11-01T12:20:00+07:00',
};

const usedTicketBase: Omit<Ticket, 'qrPayload'> = {
  id: 'tkt-demo-used',
  orderId: 'ord-demo-used',
  matchId: 'm-ryg',
  matchLabel: 'XClub vs Rayong City',
  opponent: 'Rayong City',
  kickoffAt: '2026-10-25T18:00:00+07:00',
  venue: STADIUM,
  holder: demoCustomer.fullName,
  zoneId: 'm-ryg-east',
  zoneName: 'East Stand',
  row: 'B',
  number: 11,
  seatLabel: 'B11',
  priceSatang: 45000,
  status: 'used',
  issuedAt: '2026-10-20T09:10:00+07:00',
  usedAt: '2026-10-25T17:42:00+07:00',
};

/** @deprecated Phase A mock data — removed in P10c-02. */
export const seedTickets: Ticket[] = [
  {
    ...seedTicketBase,
    qrPayload: buildTicketQr(seedTicketBase),
  },
  {
    ...usedTicketBase,
    qrPayload: buildTicketQr(usedTicketBase),
  },
];

/** @deprecated Phase A mock data — removed in P10c-02. */
export const demoProfile = demoCustomer;

/** @deprecated Phase A mock data — removed in P10c-02. */
export function brandGradient(index = 0): [string, string] {
  const presets: [string, string][] = [
    ['#0B6B3A', '#041B10'],
    ['#0F766E', '#042F2E'],
    ['#1D4ED8', '#0B1220'],
    ['#B45309', '#1C0A04'],
  ];
  return presets[index % presets.length];
}

/** @deprecated Phase A mock data — removed in P10c-02. */
export function initialsFor(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .slice(0, 2)
    .join('');
}

/** @deprecated Phase A mock data — removed in P10c-02. */
export const zoneColorFallback = palette.primary;
