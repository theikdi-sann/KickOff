import { Platform } from 'react-native';
import { brand } from '@kickoff/shared';

/**
 * Semantic aliases for the mobile app. All brand colour values come from
 * `brand` in `@kickoff/shared` — edit that file to re-skin the app.
 */
export const colors = {
  ...brand,
  bg: brand.appBackground,
  text: brand.ink,
  line: brand.line,
  softGreen: brand.softGreen,
  softGold: brand.softGold,
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
    shadowColor: brand.shadow,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 18,
  },
  android: { elevation: 3 },
  default: { boxShadow: `0px 8px 24px ${brand.shadow}14` } as never,
});

export const radii = {
  sm: 10,
  md: 16,
  lg: 22,
  xl: 28,
  pill: 999,
};
