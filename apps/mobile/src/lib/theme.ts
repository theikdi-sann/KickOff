import { Platform } from 'react-native';

import { palette } from '@xclub/shared';

export const colors = {
  ...palette,
  bg: '#F5F7F6',
  card: '#FFFFFF',
  text: '#0F172A',
  muted: '#64748B',
  line: '#E5EAE7',
  softGreen: '#E7F4EC',
  softGold: '#FEF7DF',
};

export const fonts = {
  display: 'BarlowCondensed_700Bold',
  displaySemi: 'BarlowCondensed_600SemiBold',
  body: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  bold: 'Inter_700Bold',
};

export const shadow = Platform.select({
  ios: {
    shadowColor: '#0B2016',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 18,
  },
  android: { elevation: 3 },
  default: { boxShadow: '0px 8px 24px rgba(11, 32, 22, 0.08)' } as never,
});

export const radii = {
  sm: 10,
  md: 16,
  lg: 22,
  xl: 28,
  pill: 999,
};
