import type { ConfigContext, ExpoConfig } from 'expo/config';

/**
 * Dynamic Expo config. Keeps the generated native config in sync with the
 * environment while preserving every value that was previously in app.json.
 */
export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'XClub',
  slug: 'xclub',
  version: '0.1.0',
  orientation: 'portrait',
  icon: './assets/images/icon.png',
  scheme: 'xclub',
  userInterfaceStyle: 'light',
  android: {
    adaptiveIcon: {
      backgroundColor: '#07130D',
      foregroundImage: './assets/images/android-icon-foreground.png',
      backgroundImage: './assets/images/android-icon-background.png',
      monochromeImage: './assets/images/android-icon-monochrome.png',
    },
    predictiveBackGestureEnabled: false,
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
        backgroundColor: '#07130D',
        image: './assets/images/splash-icon.png',
        imageWidth: 76,
      },
    ],
    'expo-sharing',
    'expo-secure-store',
    [
      'expo-notifications',
      {
        color: '#0B6B3A',
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
