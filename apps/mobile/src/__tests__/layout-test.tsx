import { render } from '@testing-library/react-native';
import RootLayout from '@/app/_layout';

// BOOT-1 — the boot splash renders before fonts load, which means it renders
// before `RootLayout`'s font gate is passed. C10.2 gave the splash a translator
// (`useTranslator` → `useTenantDisplay` → `useQuery`), so a splash painted
// outside `QueryProvider` throws "No QueryClient set" on every cold start —
// React Native Testing Library never rendered the layout, so no gate saw it.
//
// The contract is the boot path itself: with fonts still loading, the layout
// must render its splash rather than throw.

jest.mock('expo-font', () => ({ useFonts: () => [false] }));
jest.mock('expo-splash-screen', () => ({
  preventAutoHideAsync: jest.fn(),
  hideAsync: jest.fn(() => Promise.resolve()),
}));
jest.mock('expo-router', () => ({ Stack: () => null }));

// The provider tree is part of what is under test, so `AppProvider` stays real;
// only the auth-backed store surface is replaced to keep hydration out of it.
jest.mock('@/lib/store', () => ({
  AppProvider: ({ children }: { children: React.ReactNode }) => children,
  useApp: () => ({ hydrated: false, profile: null }),
}));

// The splash reads the club's locale through React Query. No member of a unit
// test may reach a Supabase project, so the tenant read resolves empty and the
// platform default stands in — which is the same path a device takes offline.
jest.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          order: () => ({
            limit: () => ({
              maybeSingle: async () => ({ data: null, error: null }),
            }),
          }),
        }),
      }),
    }),
  },
}));

// The query client's default `gcTime` is five minutes: the suite would linger on
// that timer and Jest would force-exit the worker. The boot splash only needs a
// real `QueryClient` in context, so the factory drops the timer.
jest.mock('@/lib/queries/query-client', () => {
  const { QueryClient } = jest.requireActual('@tanstack/react-query');
  return {
    makeQueryClient: () =>
      new QueryClient({ defaultOptions: { queries: { gcTime: Infinity, retry: 0 } } }),
  };
});

describe('<RootLayout />', () => {
  it('renders the brand splash while fonts load', async () => {
    const { getByText, unmount } = await render(<RootLayout />);

    expect(getByText('KICKOFF')).toBeTruthy();
    expect(getByText('MATCHDAY, SIMPLIFIED')).toBeTruthy();

    unmount();
  });
});
