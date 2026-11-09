import { ChevronLeft, Eye, EyeOff, Lock, Mail, ShieldCheck } from 'lucide-react-native';
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
import { AppText, MockTag, PrimaryButton } from '@/components/ui';
import { useApp } from '@/lib/store';
import { colors, fonts, radii } from '@/lib/theme';

export default function LoginScreen() {
  const router = useRouter();
  const { signIn, signInDemo } = useApp();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const demoEnabled = Boolean(
    process.env.EXPO_PUBLIC_DEMO_EMAIL && process.env.EXPO_PUBLIC_DEMO_PASSWORD,
  );

  const handleSignIn = async () => {
    if (!email.includes('@') || password.length < 8) {
      setError('Enter a valid email and a password of at least 8 characters.');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      await signIn(email, password);
      router.replace('/');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not sign in.');
    } finally {
      setLoading(false);
    }
  };

  const handleDemo = async () => {
    setError(null);
    setLoading(true);
    try {
      await signInDemo();
      router.replace('/');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Demo sign-in is unavailable.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.flex}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.top}>
          <Pressable onPress={() => router.back()} style={styles.back}>
            <ChevronLeft size={22} color={colors.text} />
          </Pressable>
          <MockTag />
        </View>

        <View style={styles.brandRow}>
          <View style={styles.logo}>
            <AppText variant="h2" color={colors.ink}>
              X
            </AppText>
          </View>
          <AppText variant="h2" style={styles.brand}>
            XCLUB
          </AppText>
        </View>

        <AppText variant="display" style={styles.title}>
          WELCOME{'\n'}BACK.
        </AppText>
        <AppText variant="body" color={colors.muted} style={styles.subtitle}>
          Sign in to manage your tickets, seats, and match day.
        </AppText>

        <View style={styles.form}>
          <Field
            label="EMAIL"
            icon={<Mail size={17} color={colors.muted} />}
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            keyboardType="email-address"
            autoCapitalize="none"
          />
          <Field
            label="PASSWORD"
            icon={<Lock size={17} color={colors.muted} />}
            value={password}
            onChangeText={setPassword}
            placeholder="Your password"
            secureTextEntry={!showPassword}
            right={
              <Pressable onPress={() => setShowPassword((value) => !value)} hitSlop={10}>
                {showPassword ? (
                  <EyeOff size={18} color={colors.muted} />
                ) : (
                  <Eye size={18} color={colors.muted} />
                )}
              </Pressable>
            }
          />

          {error ? (
            <View style={styles.errorBox}>
              <AppText variant="small" color={colors.danger}>
                {error}
              </AppText>
            </View>
          ) : null}

          <Pressable
            onPress={() => router.push('/forgot-password')}
            hitSlop={8}
            style={styles.forgot}>
            <AppText variant="caption" color={colors.primary}>
              Forgot your password?
            </AppText>
          </Pressable>

          <PrimaryButton
            label="Sign in"
            onPress={handleSignIn}
            loading={loading}
            icon={<ShieldCheck size={18} color="#FFFFFF" />}
            style={styles.submit}
          />

          {demoEnabled ? (
            <>
              <View style={styles.orRow}>
                <View style={styles.orLine} />
                <AppText variant="caption" color={colors.muted}>
                  OR
                </AppText>
                <View style={styles.orLine} />
              </View>

              <PrimaryButton
                label="Continue with demo fan account"
                tone="gold"
                onPress={handleDemo}
              />
              <AppText variant="small" color={colors.muted} style={styles.hint}>
                The demo account is preloaded with one active pass and one used pass.
              </AppText>
            </>
          ) : null}
        </View>

        <Pressable onPress={() => router.push('/register')} style={styles.registerLink}>
          <AppText variant="small" color={colors.muted}>
            New to XClub?{' '}
            <AppText variant="label" color={colors.primary}>
              Create an account
            </AppText>
          </AppText>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Field({
  label,
  icon,
  right,
  ...input
}: {
  label: string;
  icon: React.ReactNode;
  right?: React.ReactNode;
} & React.ComponentProps<typeof TextInput>) {
  return (
    <View style={styles.field}>
      <AppText variant="caption" color={colors.muted} style={styles.fieldLabel}>
        {label}
      </AppText>
      <View style={styles.inputWrap}>
        {icon}
        <TextInput
          {...input}
          placeholderTextColor="#94A3B8"
          style={styles.input}
          selectionColor={colors.primary}
        />
        {right}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: 24, paddingBottom: 40, flexGrow: 1 },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  back: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 34 },
  logo: {
    width: 30,
    height: 30,
    borderRadius: 9,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brand: { letterSpacing: 1.4, fontSize: 22 },
  title: { marginTop: 26, fontSize: 48, lineHeight: 47 },
  subtitle: { marginTop: 10, maxWidth: 320 },
  form: { marginTop: 28, gap: 16 },
  field: { gap: 7 },
  fieldLabel: { fontSize: 9, letterSpacing: 1 },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 54,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 15,
  },
  input: { flex: 1, fontFamily: fonts.body, fontSize: 14, color: colors.text, paddingVertical: 0 },
  errorBox: {
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    padding: 11,
    borderRadius: radii.sm,
  },
  submit: { marginTop: 4 },
  orRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginVertical: 2 },
  orLine: { flex: 1, height: 1, backgroundColor: colors.line },
  hint: { textAlign: 'center', fontSize: 11, lineHeight: 17, paddingHorizontal: 12 },
  forgot: { alignSelf: 'flex-end', marginTop: -4, marginBottom: 4, paddingVertical: 4 },
  registerLink: { marginTop: 'auto', alignItems: 'center', paddingTop: 32 },
});
