import { BarlowCondensed_600SemiBold, BarlowCondensed_700Bold } from '@expo-google-fonts/barlow-condensed';
import { Inter_400Regular, Inter_500Medium, Inter_700Bold } from '@expo-google-fonts/inter';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { QueryProvider } from '@/lib/queries/query-provider';
import { AppProvider, useApp } from '@/lib/store';
import { colors } from '@/lib/theme';

SplashScreen.preventAutoHideAsync();

/** Branded boot screen shown while fonts load and the session hydrates. */
function BrandSplash() {
  return (
    <View style={styles.splash}>
      <View style={styles.crest}>
        <Text style={styles.crestLetter}>K</Text>
      </View>
      <Text style={styles.wordmark}>KICKOFF</Text>
      <Text style={styles.tagline}>MATCHDAY, SIMPLIFIED</Text>
      <ActivityIndicator color={colors.accent} style={styles.spinner} />
    </View>
  );
}

function RootNavigator() {
  const { hydrated } = useApp();
  if (!hydrated) return <BrandSplash />;

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.bg },
        animation: 'slide_from_right',
      }}>
      <Stack.Screen name="(auth)" />
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="match/[id]" />
      <Stack.Screen name="seats/[matchId]" />
      <Stack.Screen name="checkout" options={{ presentation: 'modal' }} />
      <Stack.Screen name="ticket/[id]" />
      <Stack.Screen name="news/[id]" />
      <Stack.Screen name="orders" />
    </Stack>
  );
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_700Bold,
    BarlowCondensed_600SemiBold,
    BarlowCondensed_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded) SplashScreen.hideAsync().catch(() => undefined);
  }, [fontsLoaded]);

  if (!fontsLoaded) return <BrandSplash />;

  return (
    <QueryProvider>
      <AppProvider>
        <StatusBar style="dark" />
        <RootNavigator />
      </AppProvider>
    </QueryProvider>
  );
}

const styles = StyleSheet.create({
  splash: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.night,
  },
  crest: {
    width: 64,
    height: 64,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    borderWidth: 1,
    borderColor: 'rgba(244, 196, 48, 0.4)',
  },
  crestLetter: {
    color: colors.accent,
    fontSize: 34,
    fontWeight: '800',
    letterSpacing: -1,
  },
  wordmark: {
    marginTop: 18,
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: 6,
  },
  tagline: {
    marginTop: 6,
    color: 'rgba(236, 253, 245, 0.45)',
    fontSize: 9,
    fontWeight: '600',
    letterSpacing: 2.5,
  },
  spinner: {
    marginTop: 26,
  },
});
