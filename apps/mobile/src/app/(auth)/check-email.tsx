import { ChevronLeft, Mail, Send } from 'lucide-react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { AppText, PrimaryButton } from '@/components/ui';
import { resendConfirmation } from '@/lib/auth';
import { colors, radii } from '@/lib/theme';

/**
 * Link-only post-signup screen: the account was created, the email is not
 * confirmed yet, and the only way in is the emailed confirmation link.
 * No code entry, no password sign-in — those fail until the link is opened.
 */
export default function CheckEmailScreen() {
  const router = useRouter();
  const { email } = useLocalSearchParams<{ email?: string }>();
  const address = typeof email === 'string' ? email : '';
  const [resending, setResending] = useState(false);
  const [resent, setResent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleResend = async () => {
    if (!address || resending) return;
    setError(null);
    setResending(true);
    try {
      await resendConfirmation(address);
      setResent(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not resend the email.');
    } finally {
      setResending(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.flex}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Pressable onPress={() => router.back()} style={styles.back}>
          <ChevronLeft size={22} color={colors.text} />
        </Pressable>

        <AppText variant="display" style={styles.title}>
          CHECK YOUR{'\n'}EMAIL.
        </AppText>
        <AppText variant="body" color={colors.muted} style={styles.subtitle}>
          We sent a confirmation link to{' '}
          <AppText variant="label" color={colors.text}>
            {address || 'your inbox'}
          </AppText>
          . Open it on this phone to activate your account, then sign in.
        </AppText>

        <View style={styles.card}>
          <Mail size={22} color={colors.primary} />
          <View style={styles.cardText}>
            <AppText variant="label" color={colors.text}>
              One link, no code
            </AppText>
            <AppText variant="small" color={colors.muted} style={styles.cardBody}>
              The link confirms your email and signs you in. Nothing to type —
              if it did not arrive, check spam or send it again.
            </AppText>
          </View>
        </View>

        {resent ? (
          <View style={styles.successBox}>
            <AppText variant="small" color={colors.primary}>
              Confirmation email sent again — check your inbox.
            </AppText>
          </View>
        ) : null}

        {error ? (
          <View style={styles.errorBox}>
            <AppText variant="small" color={colors.danger}>
              {error}
            </AppText>
          </View>
        ) : null}

        <PrimaryButton
          label="Resend email"
          onPress={() => void handleResend()}
          loading={resending}
          icon={<Send size={17} color="#FFFFFF" />}
          style={styles.resend}
        />

        <Pressable onPress={() => router.replace('/login')} style={styles.loginLink}>
          <AppText variant="small" color={colors.muted}>
            Already confirmed?{' '}
            <AppText variant="label" color={colors.primary}>
              Back to sign in
            </AppText>
          </AppText>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
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
  subtitle: { marginTop: 10, fontSize: 14, lineHeight: 21 },
  card: {
    marginTop: 28,
    flexDirection: 'row',
    gap: 14,
    backgroundColor: colors.card,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 18,
  },
  cardText: { flex: 1, gap: 6 },
  cardBody: { lineHeight: 18 },
  successBox: {
    marginTop: 16,
    backgroundColor: colors.softGreen,
    borderRadius: radii.md,
    padding: 14,
  },
  errorBox: {
    marginTop: 16,
    backgroundColor: '#FEF2F2',
    borderRadius: radii.sm,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  resend: { marginTop: 20 },
  loginLink: { marginTop: 28, alignItems: 'center' },
});
