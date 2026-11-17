import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { passwordSchema, profileUpdateSchema } from '@kickoff/shared';
import { AppText, Card, PrimaryButton, Screen, ScreenHeader, Skeleton } from '@/components/ui';
import { useTranslator } from '@/lib/i18n';
import { errorMessage } from '@/lib/api';
import type { AppProfile } from '@/lib/auth';
import { useChangePassword, useProfile, useUpdateProfile } from '@/lib/queries/profile';
import { colors, radii } from '@/lib/theme';

// The rules come from the shared schemas; this screen only chooses the copy
// the supporter sees (F-11).
const NAME_REQUIRED_MESSAGE = 'Enter your name.';
const PHONE_TOO_LONG_MESSAGE = 'That phone number must be 32 characters or fewer.';
const PASSWORD_TOO_SHORT_MESSAGE = 'Passwords must be at least 8 characters.';
const PASSWORDS_DO_NOT_MATCH_MESSAGE = 'The two passwords do not match.';

export default function EditProfileScreen() {
  const t = useTranslator();
  const router = useRouter();
  const profileQuery = useProfile();

  if (profileQuery.isLoading) {
    return (
      <Screen>
        <ScreenHeader title={t('Personal details')} onBack={() => router.back()} />
        <View style={styles.loading}>
          <Skeleton height={220} radius={18} />
          <Skeleton height={180} radius={18} />
        </View>
      </Screen>
    );
  }

  if (!profileQuery.data) {
    return (
      <Screen>
        <ScreenHeader title={t('Personal details')} onBack={() => router.back()} />
        <View style={styles.loading}>
          <AppText variant="small" color={colors.muted}>
            {profileQuery.error instanceof Error
              ? profileQuery.error.message
              : 'Sign in to edit your details.'}
          </AppText>
        </View>
      </Screen>
    );
  }

  return <EditForm profile={profileQuery.data} />;
}

function EditForm({ profile }: { profile: AppProfile }) {
  const t = useTranslator();
  const router = useRouter();
  const updateProfile = useUpdateProfile();
  const changePassword = useChangePassword();
  const [fullName, setFullName] = useState(profile.fullName);
  const [phone, setPhone] = useState(profile.phone ?? '');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);

  const saving = updateProfile.isPending || changePassword.isPending;

  const handleSave = async () => {
    setError(null);
    const details = profileUpdateSchema.safeParse({
      fullName,
      phone: phone.trim() ? phone.trim() : null,
    });
    if (!details.success) {
      // Only the name and the phone are parsed here, so the message is chosen
      // from the issue that actually failed instead of guessing.
      const phoneRejected = details.error.issues.some(
        (issue) => issue.path[0] === 'phone',
      );
      setError(phoneRejected ? PHONE_TOO_LONG_MESSAGE : NAME_REQUIRED_MESSAGE);
      return;
    }

    let nextPassword: string | null = null;
    if (password) {
      const parsedPassword = passwordSchema.safeParse(password);
      if (!parsedPassword.success) {
        setError(PASSWORD_TOO_SHORT_MESSAGE);
        return;
      }
      if (password !== confirm) {
        setError(PASSWORDS_DO_NOT_MATCH_MESSAGE);
        return;
      }
      nextPassword = parsedPassword.data;
    }

    try {
      await updateProfile.mutateAsync({
        fullName: details.data.fullName ?? profile.fullName,
        phone: details.data.phone ?? null,
      });
      if (nextPassword) await changePassword.mutateAsync(nextPassword);
      Alert.alert(t('Saved'), 'Your details have been updated.');
      router.back();
    } catch (caught) {
      setError(errorMessage(caught));
    }
  };

  return (
    <Screen>
      <ScreenHeader title={t('Personal details')} subtitle="Account" onBack={() => router.back()} />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <Card style={styles.card}>
            <Field label={t('Full name')} value={fullName} onChangeText={setFullName} autoCapitalize="words" />
            <Field
              label={t('Phone (optional)')}
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
            />
            <Field label={t('Email')} value={profile.email} editable={false} />
          </Card>

          <AppText variant="caption" color={colors.muted} style={styles.sectionLabel}>{t('CHANGE PASSWORD')}</AppText>
          <Card style={styles.card}>
            <Field
              label={t('New password')}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              placeholder={t('Leave blank to keep current')}
            />
            <Field
              label={t('Confirm new password')}
              value={confirm}
              onChangeText={setConfirm}
              secureTextEntry
            />
          </Card>

          {error ? (
            <AppText variant="small" color={colors.danger} style={styles.error}>
              {error}
            </AppText>
          ) : null}

          <PrimaryButton
            label={t('Save changes')}
            onPress={() => void handleSave()}
            loading={saving}
            style={styles.save}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

function Field({
  label,
  value,
  onChangeText,
  editable = true,
  secureTextEntry,
  keyboardType,
  autoCapitalize,
  placeholder,
}: {
  label: string;
  value: string;
  onChangeText?: (value: string) => void;
  editable?: boolean;
  secureTextEntry?: boolean;
  keyboardType?: 'default' | 'phone-pad' | 'email-address';
  autoCapitalize?: 'none' | 'words' | 'sentences';
  placeholder?: string;
}) {
  return (
    <View style={styles.field}>
      <AppText variant="caption" color={colors.muted} style={styles.fieldLabel}>
        {label.toUpperCase()}
      </AppText>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        editable={editable}
        secureTextEntry={secureTextEntry}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        placeholder={placeholder}
        placeholderTextColor={colors.muted}
        style={[styles.input, !editable && styles.inputDisabled]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  loading: { padding: 20, gap: 14 },
  scroll: { paddingHorizontal: 20, paddingBottom: 48 },
  card: { padding: 16, gap: 14 },
  sectionLabel: { fontSize: 9, letterSpacing: 1, marginTop: 22, marginBottom: 9, marginLeft: 2 },
  field: { gap: 5 },
  fieldLabel: { fontSize: 8, letterSpacing: 0.8 },
  input: {
    minHeight: 46,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surfaceAlt,
    paddingHorizontal: 12,
    fontSize: 15,
    color: colors.text,
  },
  inputDisabled: { opacity: 0.6 },
  error: { marginTop: 14 },
  save: { marginTop: 22 },
});
