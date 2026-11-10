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
import { AppText, Card, PrimaryButton, Screen, ScreenHeader, Skeleton } from '@/components/ui';
import { errorMessage } from '@/lib/api';
import type { AppProfile } from '@/lib/auth';
import { useChangePassword, useProfile, useUpdateProfile } from '@/lib/queries/profile';
import { colors, radii } from '@/lib/theme';

export default function EditProfileScreen() {
  const router = useRouter();
  const profileQuery = useProfile();

  if (profileQuery.isLoading) {
    return (
      <Screen>
        <ScreenHeader title="Personal details" onBack={() => router.back()} />
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
        <ScreenHeader title="Personal details" onBack={() => router.back()} />
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
    if (!fullName.trim()) {
      setError('Enter your name.');
      return;
    }
    if (password && password.length < 8) {
      setError('Passwords must be at least 8 characters.');
      return;
    }
    if (password && password !== confirm) {
      setError('The two passwords do not match.');
      return;
    }

    try {
      await updateProfile.mutateAsync({
        fullName: fullName.trim(),
        phone: phone.trim() ? phone.trim() : null,
      });
      if (password) await changePassword.mutateAsync(password);
      Alert.alert('Saved', 'Your details have been updated.');
      router.back();
    } catch (caught) {
      setError(errorMessage(caught));
    }
  };

  return (
    <Screen>
      <ScreenHeader title="Personal details" subtitle="Account" onBack={() => router.back()} />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <Card style={styles.card}>
            <Field label="Full name" value={fullName} onChangeText={setFullName} autoCapitalize="words" />
            <Field
              label="Phone (optional)"
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
            />
            <Field label="Email" value={profile.email} editable={false} />
          </Card>

          <AppText variant="caption" color={colors.muted} style={styles.sectionLabel}>
            CHANGE PASSWORD
          </AppText>
          <Card style={styles.card}>
            <Field
              label="New password"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              placeholder="Leave blank to keep current"
            />
            <Field
              label="Confirm new password"
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
            label="Save changes"
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
