import { ChevronLeft, Eye, EyeOff, Lock, Mail, UserRound } from 'lucide-react-native';
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
import { AppText, LiveTag, PrimaryButton } from '@/components/ui';
import { useApp } from '@/lib/store';
import { colors, fonts, radii } from '@/lib/theme';

export default function RegisterScreen() {
  const router = useRouter();
  const { signUp } = useApp();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSignUp = async () => {
    if (fullName.trim().length < 2) {
      setError('Please enter your full name.');
      return;
    }
    if (!email.includes('@')) {
      setError('Please enter a valid email address.');
      return;
    }
    if (password.length < 8) {
      setError('Your password must be at least 8 characters.');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      await signUp(fullName.trim(), email.trim(), password);
      router.replace('/');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not create your account.');
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
          <LiveTag />
        </View>

        <AppText variant="display" style={styles.title}>
          JOIN THE{'\n'}CLUB.
        </AppText>
        <AppText variant="body" color={colors.muted} style={styles.subtitle}>
          Create your supporter account and get your first digital match pass.
        </AppText>

        <View style={styles.form}>
          <Field
            label="FULL NAME"
            icon={<UserRound size={17} color={colors.muted} />}
            value={fullName}
            onChangeText={setFullName}
            placeholder="Your full name"
            autoCapitalize="words"
          />
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
            placeholder="At least 6 characters"
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

          <PrimaryButton label="Create account" onPress={handleSignUp} loading={loading} />
          <AppText variant="small" color={colors.muted} style={styles.terms}>
            By continuing you agree to the terms of service and match day ground rules.
          </AppText>
        </View>

        <Pressable onPress={() => router.replace('/login')} style={styles.loginLink}>
          <AppText variant="small" color={colors.muted}>
            Already have an account?{' '}
            <AppText variant="label" color={colors.primary}>
              Sign in
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
  title: { marginTop: 34, fontSize: 50, lineHeight: 48 },
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
  terms: { textAlign: 'center', fontSize: 10, lineHeight: 16, paddingHorizontal: 14 },
  loginLink: { marginTop: 'auto', alignItems: 'center', paddingTop: 32 },
});
