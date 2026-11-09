import { ChevronLeft, Mail, Send } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { AppText, PrimaryButton } from '@/components/ui';
import { requestPasswordReset } from '@/lib/auth';
import { colors, fonts, radii } from '@/lib/theme';

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!email.includes('@')) {
      setError('Enter a valid email address.');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      await requestPasswordReset(email.trim());
      setSent(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not send the reset email.');
    } finally {
      setLoading(false);
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
          RESET YOUR{'\n'}PASSWORD.
        </AppText>
        <AppText variant="body" color={colors.muted} style={styles.subtitle}>
          We&apos;ll email you a secure link. Open it on this phone to choose a new password.
        </AppText>

        {sent ? (
          <View style={styles.successBox}>
            <AppText variant="label" color={colors.primary}>
              Check your inbox
            </AppText>
            <AppText variant="small" color={colors.muted} style={styles.successText}>
              If an account exists for {email.trim()}, a reset link is on its way.
            </AppText>
          </View>
        ) : (
          <View style={styles.form}>
            <View style={styles.field}>
              <AppText variant="caption" color={colors.muted} style={styles.fieldLabel}>
                EMAIL
              </AppText>
              <View style={styles.inputWrap}>
                <Mail size={17} color={colors.muted} />
                <TextInput
                  value={email}
                  onChangeText={setEmail}
                  placeholder="you@example.com"
                  placeholderTextColor="#94A3B8"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoComplete="email"
                  style={styles.input}
                  selectionColor={colors.primary}
                />
              </View>
            </View>

            {error ? (
              <View style={styles.errorBox}>
                <AppText variant="small" color={colors.danger}>
                  {error}
                </AppText>
              </View>
            ) : null}

            <PrimaryButton
              label="Send reset link"
              onPress={handleSubmit}
              loading={loading}
              icon={<Send size={17} color="#FFFFFF" />}
              style={styles.submit}
            />
          </View>
        )}
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
  form: { marginTop: 28, gap: 16 },
  field: { gap: 6 },
  fieldLabel: { fontSize: 9, letterSpacing: 1 },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.card,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: 14,
    height: 52,
  },
  input: { flex: 1, fontSize: 14, fontFamily: fonts.body, color: colors.ink },
  errorBox: {
    backgroundColor: '#FEF2F2',
    borderRadius: radii.sm,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  successBox: {
    marginTop: 28,
    backgroundColor: colors.softGreen,
    borderRadius: radii.lg,
    padding: 20,
    gap: 8,
  },
  successText: { lineHeight: 20 },
  submit: { marginTop: 4 },
});
