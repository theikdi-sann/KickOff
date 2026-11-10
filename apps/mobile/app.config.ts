import type { ConfigContext, ExpoConfig } from 'expo/config';
import { brand } from '@kickoff/shared/theme';

/**
 * Dynamic Expo config. Keeps the generated native config in sync with the
 * environment while preserving every value that was previously in app.json.
 *
 * Native tint colours come from `brand` in `@kickoff/shared` so a palette
 * change stays a single-file edit.
 */
export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'KickOff',
  slug: 'kickoff',
  version: '0.1.0',
  orientation: 'portrait',
  icon: './assets/images/icon.png',
  scheme: 'kickoff',
  userInterfaceStyle: 'light',
  android: {
    package: 'app.kickoff.fan',
    adaptiveIcon: {
      backgroundColor: brand.night,
      foregroundImage: './assets/images/android-icon-foreground.png',
      backgroundImage: './assets/images/android-icon-background.png',
      monochromeImage: './assets/images/android-icon-monochrome.png',
    },
    predictiveBackGestureEnabled: false,
  },
  ios: {
    bundleIdentifier: 'app.kickoff.fan',
    supportsTablet: false,
  },
  web: {
    output: 'server',
    favicon: './assets/images/favicon.png',
  },
  plugins: [
    'expo-router',
    [
      'expo-splash-screen',
      {
        backgroundColor: brand.night,
        image: './assets/images/splash-icon.png',
        imageWidth: 76,
      },
    ],
    'expo-sharing',
    'expo-secure-store',
    [
      'expo-notifications',
      {
        color: brand.primary,
        defaultChannel: 'default',
      },
    ],
  ],
  experiments: {
    typedRoutes: true,
    reactCompiler: true,
  },
  extra: {
    ...config.extra,
    functionsUrl:
      process.env.EXPO_PUBLIC_FUNCTIONS_URL ??
      (process.env.EXPO_PUBLIC_SUPABASE_URL
        ? `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1`
        : undefined),
    eas: {
      projectId: process.env.EAS_PROJECT_ID,
    },
  },
});
