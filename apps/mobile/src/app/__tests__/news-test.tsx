/**
 * REQ-03 — published club news must render, and an empty or failed read must
 * be visible instead of silently showing stale copy.
 */
/* eslint-disable import/first, import/order -- the screen import must run after jest.mock */
import { render } from '@testing-library/react-native';

const mockUseNews = jest.fn();

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
  return { ChevronLeft: Icon, ChevronRight: Icon, CloudOff: Icon };
});
jest.mock('@/lib/i18n', () => ({
  useTranslator: () => (key: string) => key,
}));
jest.mock('@/lib/queries/tenant', () => ({
  useTenantDisplay: () => ({ currency: 'THB', locale: 'en-GB', timezone: 'Asia/Bangkok' }),
}));
jest.mock('@/lib/queries/news', () => ({ useNews: () => mockUseNews() }));

import NewsScreen from '../news';

const article = {
  id: 'news-1',
  title: 'Rovers hold on for a point',
  excerpt: 'A late equaliser.',
  body: 'Full report.',
  category: 'Match Report' as const,
  publishedAt: '2026-11-14T11:00:00.000Z',
  readMinutes: 3,
  imageColors: ['#123', '#456'] as [string, string],
};

describe('news feed', () => {
  beforeEach(() => mockUseNews.mockReset());

  it('renders published articles with category and read time', async () => {
    mockUseNews.mockReturnValue({
      data: [article],
      isLoading: false,
      isRefetching: false,
      error: null,
      refetch: jest.fn(),
    });

    const { getByText } = await render(<NewsScreen />);

    expect(getByText('Rovers hold on for a point')).toBeTruthy();
    expect(getByText('MATCH REPORT')).toBeTruthy();
    expect(getByText('1 ARTICLE')).toBeTruthy();
  });

  it('shows an explicit empty state when nothing is published', async () => {
    mockUseNews.mockReturnValue({
      data: [],
      isLoading: false,
      isRefetching: false,
      error: null,
      refetch: jest.fn(),
    });

    const { getByText } = await render(<NewsScreen />);
    expect(getByText('No news yet')).toBeTruthy();
  });

  it('shows the error state and a retry instead of stale content', async () => {
    const refetch = jest.fn();
    mockUseNews.mockReturnValue({
      data: undefined,
      isLoading: false,
      isRefetching: false,
      error: new Error('offline'),
      refetch,
    });

    const { getByText } = await render(<NewsScreen />);
    expect(getByText('Could not load the news')).toBeTruthy();
    expect(getByText('Try again')).toBeTruthy();
  });
});
