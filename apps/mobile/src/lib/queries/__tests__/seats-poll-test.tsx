/**
 * NFR-13 / REQ-05 — the seat map must actually poll, not merely pass a
 * `refetchInterval` number through. Source-text contracts cannot prove that, so
 * this drives the real `useSeatMap` hook under fake timers and counts the
 * network calls: nothing at 2 999 ms, a fresh fetch at 3 000 ms.
 */
/* eslint-disable import/first, import/order -- the mock must be installed before the hook import */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react-native';
import type { ReactNode } from 'react';

const mockFrom = jest.fn();

jest.mock('@/lib/supabase', () => ({
  supabase: { from: (...args: unknown[]) => mockFrom(...args) },
}));

import { useSeatMap } from '../seats';

/** A minimal stand-in for the Supabase query builder, which is thenable. */
interface SeatQueryBuilder {
  select: () => SeatQueryBuilder;
  eq: () => SeatQueryBuilder;
  order: () => SeatQueryBuilder;
  then: (
    onFulfilled: (value: { data: unknown[]; error: null }) => unknown,
    onRejected?: (reason: unknown) => unknown,
  ) => Promise<unknown>;
}

function seatRows(rows: unknown[] = []) {
  const builder: SeatQueryBuilder = {
    select: jest.fn(() => builder),
    eq: jest.fn(() => builder),
    order: jest.fn(() => builder),
    then: (onFulfilled, onRejected) =>
      Promise.resolve({ data: rows, error: null }).then(onFulfilled, onRejected),
  };
  return builder;
}

function wrapper(client: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

describe('useSeatMap live polling', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockFrom.mockReset();
    mockFrom.mockImplementation(() => seatRows());
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('refetches the seat map every three seconds — and not before', async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: Infinity, staleTime: 0 } },
    });
    const { result, unmount } = await renderHook(
      () => useSeatMap('zone-north', { refetchInterval: 3000 }),
      { wrapper: wrapper(client) },
    );

    // Flush the first fetch (React Query batches its success notification on a
    // zero-delay timer, which the fake clock owns).
    await act(async () => {
      await jest.advanceTimersByTimeAsync(0);
    });

    expect(result.current.isSuccess).toBe(true);
    expect(mockFrom).toHaveBeenCalledTimes(1);

    await act(async () => {
      await jest.advanceTimersByTimeAsync(2_999);
    });
    expect(mockFrom).toHaveBeenCalledTimes(1);

    await act(async () => {
      await jest.advanceTimersByTimeAsync(1);
    });
    expect(mockFrom).toHaveBeenCalledTimes(2);

    unmount();
    client.clear();
  });
});
