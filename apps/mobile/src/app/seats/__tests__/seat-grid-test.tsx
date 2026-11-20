/**
 * NFR-15 — the seat grid must be usable with a screen reader and a keyboard.
 *
 * The grid is a list of `Pressable`s, so the accessible contract is: every
 * seat is a focused button with a name that includes its state, a sold seat is
 * disabled, and selecting a seat updates the announced state. On react-native-
 * web the same role is what makes Enter/Space activate a seat.
 */
/* eslint-disable import/first, import/order -- the screen import must run after jest.mock */
import { act, fireEvent, render } from '@testing-library/react-native';

const seats = [
  { id: 'seat-a1', zoneId: 'zone-north', row: 'A', number: 1, label: 'A1' },
  { id: 'seat-a2', zoneId: 'zone-north', row: 'A', number: 2, label: 'A2' },
  { id: 'seat-a3', zoneId: 'zone-north', row: 'A', number: 3, label: 'A3' },
];

const mockMutateAsync = jest.fn().mockResolvedValue({ id: 'hold-1' });

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ matchId: 'm-bkk', zoneId: 'zone-north' }),
  useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
}));

jest.mock('expo-web-browser', () => ({ openBrowserAsync: jest.fn() }));
jest.mock('lucide-react-native', () => {
  const React = require('react');
  const { View } = require('react-native');
  const Icon = (props: Record<string, unknown>) => React.createElement(View, props);
  return { ChevronLeft: Icon, ShieldCheck: Icon };
});
jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return {
    SafeAreaView: View,
    useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
  };
});

jest.mock('@/lib/i18n', () => ({
  useTranslator: () => (key: string, params?: Record<string, string | number>) =>
    String(key).replace(/\{(\w+)\}/g, (_, name: string) => String(params?.[name] ?? '')),
}));

jest.mock('@/lib/api', () => ({ errorMessage: (error: unknown) => String(error) }));

jest.mock('@/lib/queries/tenant', () => ({
  useTenantDisplay: () => ({ currency: 'THB', locale: 'en-GB', timezone: 'Asia/Bangkok' }),
}));

jest.mock('@/lib/queries/matches', () => ({
  useMatch: () => ({
    data: { id: 'm-bkk', opponent: 'Bangkok Rovers', kickoffAt: '2026-12-01T11:00:00.000Z' },
    isLoading: false,
    error: null,
  }),
}));

jest.mock('@/lib/queries/seats', () => ({
  useZones: () => ({
    data: [
      {
        id: 'zone-north',
        name: 'North Stand',
        description: 'Behind the goal',
        color: '#22C55E',
        priceMinorUnits: 35000,
        rows: ['A'],
        seatsPerRow: 3,
      },
    ],
  }),
  useSeatMap: () => ({ data: seats, refetch: jest.fn() }),
  useTakenSeats: () => ({ data: new Set(['seat-a2']) }),
}));

jest.mock('@/lib/queries/holds', () => ({
  useCreateHold: () => ({ mutateAsync: mockMutateAsync, isPending: false }),
  useMyActiveHolds: () => ({ data: [] }),
  useReleaseHold: () => ({ mutateAsync: jest.fn() }),
}));

jest.mock('@/lib/queries/orders', () => ({
  useCancelOrder: () => ({ mutateAsync: jest.fn() }),
  usePendingOrderSeats: () => ({ data: [] }),
}));

import SeatSelectionScreen from '../[matchId]';

describe('seat grid accessibility', () => {
  it('announces every seat as a button with its label and state', async () => {
    const { getAllByText, getByLabelText } = await render(<SeatSelectionScreen />);

    expect((await getAllByText('North Stand')).length).toBeGreaterThan(0);
    expect(getByLabelText('Seat A1')).toBeTruthy();
    expect(getByLabelText('Seat A2 taken')).toBeTruthy();
    expect(getByLabelText('Seat A3')).toBeTruthy();
  });

  it('disables a sold seat and marks it unavailable to assistive tech', async () => {
    const { getByLabelText } = await render(<SeatSelectionScreen />);
    const sold = getByLabelText('Seat A2 taken');

    expect(sold.props.accessibilityState).toMatchObject({ disabled: true, selected: false });
    expect(sold.props.accessibilityRole).toBe('button');
  });

  it('selects a seat on activation and announces the new state', async () => {
    const { getByLabelText } = await render(<SeatSelectionScreen />);
    const seat = getByLabelText('Seat A1');

    await act(async () => {
      fireEvent.press(seat);
    });

    expect(getByLabelText('Seat A1 selected').props.accessibilityState).toMatchObject({
      selected: true,
      disabled: false,
    });
  });

  it('does not select a sold seat when it is activated', async () => {
    const { getByLabelText } = await render(<SeatSelectionScreen />);

    await act(async () => {
      fireEvent.press(getByLabelText('Seat A2 taken'));
    });

    expect(getByLabelText('Seat A2 taken').props.accessibilityState).toMatchObject({
      selected: false,
    });
  });
});
