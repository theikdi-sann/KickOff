import * as Linking from 'expo-linking';
import { ChevronLeft, Lock, ShieldCheck } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
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
import { applyLinkSession, updatePassword } from '@/lib/auth';
import { colors, fonts, radii } from '@/lib/theme';

function readRecoveryTokens(url: string): { access?: string; refresh?: string } {
  const hash = url.includes('#') ? url.slice(url.indexOf('#') + 1) : '';
  const params = new URLSearchParams(hash);
  const parsed = Linking.parse(url);
  const query = parsed.queryParams ?? {};

  const access =
    params.get('access_token') ??
    (typeof query.access_token === 'string' ? query.access_token : undefined);
  const refresh =
    params.get('refresh_token') ??
    (typeof query.refresh_token === 'string' ? query.refresh_token : undefined);
  return { access, refresh };
}

export default function ResetPasswordScreen() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [tokenError, setTokenError] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    const consume = async (url: string | null) => {
      if (!url) return;
      const { access, refresh } = readRecoveryTokens(url);
      if (!access || !refresh) return;
      try {
        await applyLinkSession(access, refresh);
      } catch (caught) {
        if (active) {
          setTokenError(caught instanceof Error ? caught.message : 'This reset link is invalid.');
        }
      }
    };

    void Linking.getInitialURL().then((url) => {
      void consume(url).then(() => {
        if (active) setReady(true);
      });
    });

    const subscription = Linking.addEventListener('url', (event) => {
      void consume(event.url);
    });

    return () => {
      active = false;
      subscription.remove();
    };
  }, []);

  const handleSubmit = async () => {
    if (password.length < 8) {
      setError('Use at least 8 characters.');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      await updatePassword(password);
      router.replace('/');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not update your password.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.flex}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Pressable onPress={() => router.replace('/login')} style={styles.back}>
          <ChevronLeft size={22} color={colors.text} />
        </Pressable>

        <AppText variant="display" style={styles.title}>
          CHOOSE A{'\n'}NEW PASSWORD.
        </AppText>
        <AppText variant="body" color={colors.muted} style={styles.subtitle}>
          You opened a recovery link. Set a new password to get back to your tickets.
        </AppText>

        <View style={styles.form}>
          <Field label="NEW PASSWORD" value={password} onChangeText={setPassword} />
          <Field label="CONFIRM PASSWORD" value={confirm} onChangeText={setConfirm} />

          {tokenError ? (
            <View style={styles.errorBox}>
              <AppText variant="small" color={colors.danger}>
                {tokenError}
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
            label="Update password"
            onPress={handleSubmit}
            loading={loading || !ready}
            icon={<ShieldCheck size={18} color="#FFFFFF" />}
            style={styles.submit}
          />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Field({
  label,
  value,
  onChangeText,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
}) {
  return (
    <View style={styles.field}>
      <AppText variant="caption" color={colors.muted} style={styles.fieldLabel}>
        {label}
      </AppText>
      <View style={styles.inputWrap}>
        <Lock size={17} color={colors.muted} />
        <TextInput
          value={value}
          onChangeText={onChangeText}
          secureTextEntry
          autoComplete="new-password"
          placeholder="At least 8 characters"
          placeholderTextColor="#94A3B8"
          style={styles.input}
          selectionColor={colors.primary}
        />
      </View>
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
  submit: { marginTop: 4 },
});
