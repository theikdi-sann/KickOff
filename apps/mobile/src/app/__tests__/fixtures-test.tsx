/**
 * REQ-02 — the fixture list groups upcoming and played matches correctly.
 */
/* eslint-disable import/first, import/order -- the screen import must run after jest.mock */
import { render } from '@testing-library/react-native';

const now = Date.now();
const match = (overrides: Record<string, unknown>) => ({
  id: 'm-1',
  opponent: 'Bangkok Rovers',
  opponentShort: 'BKR',
  kickoffAt: new Date(now + 2 * 864e5).toISOString(),
  venue: 'KickOff Arena',
  venueId: 'v_kickoff',
  competition: 'Thai Premier League',
  homeAway: 'home',
  status: 'upcoming',
  homeScore: null,
  awayScore: null,
  posterColors: ['#0B6B3A', '#052E1A'],
  accent: '#F4C430',
  ...overrides,
});

const mockMatches = [
  match({ id: 'm-up', opponent: 'Upcoming United' }),
  match({
    id: 'm-done',
    opponent: 'Played City',
    status: 'completed',
    kickoffAt: new Date(now - 2 * 864e5).toISOString(),
    homeScore: 2,
    awayScore: 1,
  }),
  match({
    id: 'm-post',
    opponent: 'Postponed FC',
    status: 'postponed',
  }),
];

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: jest.fn(), push: jest.fn() }),
}));
jest.mock('expo-linear-gradient', () => {
  const { View } = require('react-native');
  return { LinearGradient: View };
});
jest.mock('lucide-react-native', () => {
  const React = require('react');
  const { View } = require('react-native');
  const Icon = (props: Record<string, unknown>) => React.createElement(View, props);
  return {
    CalendarDays: Icon,
    ChevronLeft: Icon,
    ChevronRight: Icon,
    Clock3: Icon,
    CloudOff: Icon,
    MapPin: Icon,
  };
});
jest.mock('@/lib/i18n', () => ({
  useTranslator: () => (key: string, params?: Record<string, string | number>) =>
    String(key).replace(/\{(\w+)\}/g, (_, name: string) => String(params?.[name] ?? '')),
}));
jest.mock('@/lib/queries/tenant', () => ({
  useTenantDisplay: () => ({ currency: 'THB', locale: 'en-GB', timezone: 'Asia/Bangkok' }),
}));
jest.mock('@/lib/queries/matches', () => ({
  useMatches: () => ({
    data: mockMatches,
    isLoading: false,
    isRefetching: false,
    error: null,
    refetch: jest.fn(),
  }),
}));

import FixturesScreen from '../fixtures';

describe('fixture list', () => {
  it('shows upcoming, postponed and played fixtures in their sections', async () => {
    const { getByText, getAllByText } = await render(<FixturesScreen />);

    expect(getByText('KickOff vs Upcoming United')).toBeTruthy();
    expect(getByText('KickOff vs Postponed FC')).toBeTruthy();
    expect(getByText('Played City')).toBeTruthy();
    expect(getAllByText('Upcoming').length).toBeGreaterThan(0);
    expect(getAllByText('Postponed').length).toBeGreaterThan(0);
    expect(getAllByText('Recent results').length).toBeGreaterThan(0);
  });

  it('counts upcoming and played fixtures in the header', async () => {
    const { getByText } = await render(<FixturesScreen />);
    expect(getByText('1 UPCOMING · 1 PLAYED')).toBeTruthy();
  });
});
