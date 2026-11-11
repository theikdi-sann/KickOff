import * as Linking from 'expo-linking';
import { ChevronLeft, MailCheck } from 'lucide-react-native';
import { Redirect, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { AppText } from '@/components/ui';
import { applyLinkSession } from '@/lib/auth';
import { colors, radii } from '@/lib/theme';

interface LinkPayload {
  access?: string;
  refresh?: string;
  error?: string;
}

function readLinkPayload(url: string): LinkPayload {
  const hash = url.includes('#') ? url.slice(url.indexOf('#') + 1) : '';
  const params = new URLSearchParams(hash);
  const parsed = Linking.parse(url);
  const query = parsed.queryParams ?? {};

  const read = (key: string): string | undefined => {
    const fromHash = params.get(key);
    if (fromHash) return fromHash;
    const fromQuery = query[key];
    return typeof fromQuery === 'string' ? fromQuery : undefined;
  };

  return {
    access: read('access_token'),
    refresh: read('refresh_token'),
    error: read('error_description') ?? read('error'),
  };
}

/**
 * Consumes the confirmation-email deep link (`kickoff://auth/callback`):
 * the implicit-flow tokens establish the session and the fan lands signed-in
 * on the app root. An invalid/expired link surfaces GoTrue's explanation
 * with a way back to sign-in — no code or password entry anywhere.
 */
export default function AuthCallbackScreen() {
  const router = useRouter();
  const [failed, setFailed] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);

  useEffect(() => {
    let active = true;

    const consume = async (url: string | null) => {
      if (!url) {
        if (active) setFailed('This confirmation link is invalid or has expired.');
        return;
      }
      const { access, refresh, error } = readLinkPayload(url);
      if (!access || !refresh) {
        if (active) {
          setFailed(error ?? 'This confirmation link is invalid or has expired.');
        }
        return;
      }
      try {
        await applyLinkSession(access, refresh);
        if (active) setConfirmed(true);
      } catch (caught) {
        if (active) {
          setFailed(caught instanceof Error ? caught.message : 'Could not confirm your email.');
        }
      }
    };

    void Linking.getInitialURL().then((url) => {
      void consume(url);
    });

    const subscription = Linking.addEventListener('url', (event) => {
      void consume(event.url);
    });

    return () => {
      active = false;
      subscription.remove();
    };
  }, []);

  if (confirmed) return <Redirect href="/" />;

  if (failed) {
    return (
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <Pressable onPress={() => router.replace('/login')} style={styles.back}>
            <ChevronLeft size={22} color={colors.text} />
          </Pressable>

          <AppText variant="display" style={styles.title}>
            LINK{'\n'}EXPIRED.
          </AppText>
          <View style={styles.errorBox}>
            <AppText variant="small" color={colors.danger}>
              {failed}
            </AppText>
          </View>
          <AppText variant="body" color={colors.muted} style={styles.subtitle}>
            Confirmation links can only be used once and do expire. Sign in and we will send a
            fresh one if you still need it.
          </AppText>

          <Pressable onPress={() => router.replace('/login')} style={styles.loginLink}>
            <AppText variant="label" color={colors.primary}>
              Back to sign in
            </AppText>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  return (
    <View style={styles.center}>
      <MailCheck size={30} color={colors.primary} />
      <AppText variant="label" color={colors.text} style={styles.centerText}>
        Confirming your email…
      </AppText>
      <ActivityIndicator color={colors.primary} />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  scroll: { paddingHorizontal: 22, paddingTop: 12, paddingBottom: 40 },
  back: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: 44, lineHeight: 44, marginTop: 28 },
  subtitle: { marginTop: 14, fontSize: 14, lineHeight: 21 },
  errorBox: {
    marginTop: 20,
    backgroundColor: '#FEF2F2',
    borderRadius: radii.sm,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  loginLink: { marginTop: 28, alignItems: 'center' },
  center: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
  },
  centerText: { fontSize: 12, letterSpacing: 1 },
});
