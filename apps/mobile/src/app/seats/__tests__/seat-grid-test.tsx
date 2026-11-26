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
const mockUseSeatMap = jest.fn();
const mockUseTakenSeats = jest.fn();

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
  useSeatMap: (...args: unknown[]) => mockUseSeatMap(...args),
  useTakenSeats: (...args: unknown[]) => mockUseTakenSeats(...args),
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

beforeEach(() => {
  mockUseSeatMap.mockReturnValue({
    data: seats,
    dataUpdatedAt: Date.now(),
    refetch: jest.fn(),
  });
  mockUseTakenSeats.mockReturnValue({
    data: new Set(['seat-a2']),
    dataUpdatedAt: Date.now(),
  });
});

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

  it('continues with the selected seat to the hold call', async () => {
    const { getByLabelText, getByText } = await render(<SeatSelectionScreen />);

    await act(async () => {
      fireEvent.press(getByLabelText('Seat A1'));
    });
    await act(async () => {
      fireEvent.press(getByText('Continue'));
    });

    expect(mockMutateAsync).toHaveBeenCalledWith({
      matchId: 'm-bkk',
      seatIds: ['seat-a1'],
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

// REQ-05 / NFR-13 — live availability must poll every 3 s, keep the buyer's
// selection across a refresh, and never present a value older than 5 s as
// current. These drive the screen; the hook's real timer is proven in
// `src/lib/queries/__tests__/seats-poll-test.tsx`.
describe('live seat availability', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('polls both the seat map and the taken-seat set every three seconds', async () => {
    await render(<SeatSelectionScreen />);

    expect(mockUseSeatMap).toHaveBeenCalledWith('zone-north', { refetchInterval: 3000 });
    expect(mockUseTakenSeats).toHaveBeenCalledWith('m-bkk', { refetchInterval: 3000 });
  });

  it('keeps the selection when a poll replaces the seat data', async () => {
    const { getByLabelText, rerender } = await render(<SeatSelectionScreen />);

    await act(async () => {
      fireEvent.press(getByLabelText('Seat A1'));
    });
    expect(getByLabelText('Seat A1 selected')).toBeTruthy();

    // A poll returns a new array identity; the merge must not clear `selected`.
    mockUseSeatMap.mockReturnValue({
      data: seats.map((seat) => ({ ...seat })),
      dataUpdatedAt: Date.now(),
      refetch: jest.fn(),
    });
    await act(async () => {
      rerender(<SeatSelectionScreen />);
    });

    expect(getByLabelText('Seat A1 selected')).toBeTruthy();
  });

  it('shows a fresh value as FREE', async () => {
    const { getByText, queryByText } = await render(<SeatSelectionScreen />);

    expect(getByText('FREE')).toBeTruthy();
    expect(queryByText('STALE')).toBeNull();
  });

  it('marks an already old value as STALE instead of FREE', async () => {
    const updatedAt = Date.now() - 6_000;
    mockUseSeatMap.mockReturnValue({ data: seats, dataUpdatedAt: updatedAt, refetch: jest.fn() });
    mockUseTakenSeats.mockReturnValue({ data: new Set(['seat-a2']), dataUpdatedAt: updatedAt });

    const { getByText, queryByText } = await render(<SeatSelectionScreen />);

    expect(getByText('STALE')).toBeTruthy();
    expect(queryByText('FREE')).toBeNull();
  });

  it('flips to STALE at the five-second boundary, not before', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-12-01T10:00:00.000Z'));
    const updatedAt = Date.now();
    mockUseSeatMap.mockReturnValue({ data: seats, dataUpdatedAt: updatedAt, refetch: jest.fn() });
    mockUseTakenSeats.mockReturnValue({ data: new Set(['seat-a2']), dataUpdatedAt: updatedAt });

    const { getByText, queryByText } = await render(<SeatSelectionScreen />);
    expect(getByText('FREE')).toBeTruthy();

    await act(async () => {
      await jest.advanceTimersByTimeAsync(4_999);
    });
    expect(getByText('FREE')).toBeTruthy();

    await act(async () => {
      await jest.advanceTimersByTimeAsync(2);
    });
    expect(getByText('STALE')).toBeTruthy();
    expect(queryByText('FREE')).toBeNull();
  });
});
