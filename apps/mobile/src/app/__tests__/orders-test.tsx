/**
 * REQ-09 — order history must render the fan's orders, their status and the
 * lifetime spend. The mapping is unit-tested in `mappers.test.ts`; this covers
 * the screen that actually shows the result.
 */
/* eslint-disable import/first, import/order -- the screen import must run after jest.mock */
import { render } from '@testing-library/react-native';

const orders = [
  {
    id: 'ord-demo-1',
    userId: '11111111-1111-4111-8111-111111111111',
    matchId: 'm-bkk',
    matchLabel: 'KickOff vs Bangkok Rovers',
    seats: [
      {
        seatId: 'seat-1',
        ticketId: 'tkt-1',
        zoneId: 'zone-north',
        zoneName: 'North Stand',
        row: 'C',
        number: 7,
        priceMinorUnits: 35000,
      },
    ],
    amountMinorUnits: 35000,
    status: 'paid' as const,
    createdAt: '2026-11-01T05:20:00.000Z',
  },
  {
    id: 'ord-demo-2',
    userId: '11111111-1111-4111-8111-111111111111',
    matchId: 'm-ryg',
    matchLabel: 'KickOff vs Rayong FC',
    seats: [
      {
        seatId: 'seat-2',
        ticketId: 'tkt-2',
        zoneId: 'zone-east',
        zoneName: 'East Stand',
        row: 'B',
        number: 11,
        priceMinorUnits: 20000,
      },
    ],
    amountMinorUnits: 20000,
    status: 'refunded' as const,
    createdAt: '2026-10-20T02:10:00.000Z',
  },
];

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({}),
  useRouter: () => ({ back: jest.fn(), push: jest.fn() }),
}));
jest.mock('expo-web-browser', () => ({ openBrowserAsync: jest.fn() }));
jest.mock('lucide-react-native', () => {
  const React = require('react');
  const { View } = require('react-native');
  const Icon = (props: Record<string, unknown>) => React.createElement(View, props);
  return { ChevronLeft: Icon, Download: Icon, ReceiptText: Icon };
});
jest.mock('@/lib/i18n', () => ({
  useTranslator: () => (key: string, params?: Record<string, string | number>) =>
    String(key).replace(/\{(\w+)\}/g, (_, name: string) => String(params?.[name] ?? '')),
}));
jest.mock('@/lib/api', () => ({ errorMessage: (error: unknown) => String(error) }));
jest.mock('@/lib/receipt', () => ({ downloadAndShareReceipt: jest.fn() }));
jest.mock('@/lib/queries/tenant', () => ({
  useTenantDisplay: () => ({ currency: 'THB', locale: 'en-GB', timezone: 'Asia/Bangkok' }),
}));
jest.mock('@/lib/queries/profile', () => ({
  useProfile: () => ({ data: { fullName: 'Nara Chaiyaporn' } }),
}));
jest.mock('@/lib/queries/orders', () => ({
  useOrders: () => ({ data: orders, isLoading: false, isRefetching: false, refetch: jest.fn() }),
  useCancelOrder: () => ({ mutateAsync: jest.fn(), isPending: false }),
}));

import OrdersScreen from '../orders';

describe('order history', () => {
  it('renders every order with its status and fixture', async () => {
    const { getByText, getAllByText } = await render(<OrdersScreen />);

    expect(getByText('KickOff vs Bangkok Rovers')).toBeTruthy();
    expect(getByText('KickOff vs Rayong FC')).toBeTruthy();
    expect(getByText('PAID')).toBeTruthy();
    expect(getByText('REFUNDED')).toBeTruthy();
    expect(getAllByText('ORDER · DEMO-1').length).toBe(1);
  });

  it('shows lifetime spend for paid orders only', async () => {
    const { getAllByText, getByText, queryByText } = await render(<OrdersScreen />);

    // 35,000 satang = ฿350; the refunded ฿200 is not spend.
    expect(getAllByText('฿350').length).toBeGreaterThan(0);
    expect(queryByText('฿550')).toBeNull();
    expect(getByText('2 ORDERS · NARA CHAIYAPORN')).toBeTruthy();
  });
});
