import * as SecureStore from 'expo-secure-store';
import { LogOut, ShieldAlert, Trash2 } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { AppText, Card, PrimaryButton, Screen, ScreenHeader } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { resetLocalSession, signOut } from '@/lib/auth';
import {
  listDeviceRegistrations,
  pushSupported,
  registerPushToken,
  unregisterPushToken,
} from '@/lib/notifications';
import { colors, radii } from '@/lib/theme';

const LANGUAGE_KEY = 'kickoff.language';
const LANGUAGES = ['English', 'ไทย'] as const;

export default function SettingsScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [language, setLanguage] = useState<string>('English');
  const [busy, setBusy] = useState<'notifications' | 'delete' | null>(null);

  const devicesQuery = useQuery({
    queryKey: ['devices'],
    queryFn: listDeviceRegistrations,
    enabled: pushSupported(),
  });
  const notificationsOn = (devicesQuery.data?.length ?? 0) > 0;

  useEffect(() => {
    void SecureStore.getItemAsync(LANGUAGE_KEY)
      .then((value) => {
        if (value) setLanguage(value);
      })
      .catch(() => undefined);
  }, []);

  const toggleNotifications = async (next: boolean) => {
    setBusy('notifications');
    try {
      if (next) await registerPushToken();
      else await unregisterPushToken();
      await devicesQuery.refetch();
    } catch (error) {
      Alert.alert('Notifications', errorMessage(error));
    } finally {
      setBusy(null);
    }
  };

  const chooseLanguage = () => {
    Alert.alert('Language', 'Choose the language for match updates.', [
      ...LANGUAGES.map((option) => ({
        text: option,
        onPress: () => {
          setLanguage(option);
          void SecureStore.setItemAsync(LANGUAGE_KEY, option).catch(() => undefined);
        },
      })),
      { text: 'Cancel', style: 'cancel' as const },
    ]);
  };

  const handleSignOut = () => {
    Alert.alert('Sign out?', "You'll need to sign in again to access your passes.", [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out',
        style: 'destructive',
        onPress: () => {
          void signOut()
            .then(() => router.replace('/(auth)/welcome'))
            .catch((error) => Alert.alert('Sign out failed', errorMessage(error)));
        },
      },
    ]);
  };

  const handleDelete = () => {
    Alert.alert(
      'Delete account?',
      'Your account will be closed, passes voided, and personal details removed. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete account',
          style: 'destructive',
          onPress: () => {
            setBusy('delete');
            void api
              .post('delete-account', { reason: 'User requested deletion in app' })
              .then(async () => {
                await resetLocalSession();
                queryClient.clear();
                router.replace('/(auth)/welcome');
              })
              .catch((error) => Alert.alert('Could not delete account', errorMessage(error)))
              .finally(() => setBusy(null));
          },
        },
      ],
    );
  };

  return (
    <Screen>
      <ScreenHeader title="Settings" subtitle="Account" onBack={() => router.back()} />
      <ScrollView contentContainerStyle={styles.scroll}>
        <AppText variant="caption" color={colors.muted} style={styles.sectionLabel}>
          NOTIFICATIONS
        </AppText>
        <Card style={styles.card}>
          <View style={styles.row}>
            <View style={styles.flex}>
              <AppText variant="label">Match reminders</AppText>
              <AppText variant="small" color={colors.muted} style={styles.rowDetail}>
                Kick-off reminders 24 hours and 2 hours before home matches.
              </AppText>
            </View>
            <Switch
              value={notificationsOn}
              onValueChange={(next) => void toggleNotifications(next)}
              disabled={busy !== null || !pushSupported() || devicesQuery.isLoading}
              trackColor={{ false: colors.line, true: colors.primary }}
              thumbColor="#FFFFFF"
            />
          </View>
          {!pushSupported() ? (
            <AppText variant="caption" color={colors.muted} style={styles.hint}>
              Push notifications need a physical iOS or Android build.
            </AppText>
          ) : null}
        </Card>

        <AppText variant="caption" color={colors.muted} style={styles.sectionLabel}>
          PREFERENCES
        </AppText>
        <Card style={styles.card}>
          <Pressable onPress={chooseLanguage} style={styles.row}>
            <View style={styles.flex}>
              <AppText variant="label">Language</AppText>
              <AppText variant="small" color={colors.muted} style={styles.rowDetail}>
                Match updates and app copy
              </AppText>
            </View>
            <AppText variant="label" color={colors.primary}>
              {language}
            </AppText>
          </Pressable>
        </Card>

        <AppText variant="caption" color={colors.muted} style={styles.sectionLabel}>
          LEGAL
        </AppText>
        <Card style={styles.card}>
          <LegalRow label="Terms of use" onPress={() => router.push('/legal/terms')} />
          <LegalRow label="Privacy policy" onPress={() => router.push('/legal/privacy')} />
          <LegalRow
            label="Refund policy"
            onPress={() => router.push('/legal/refund')}
            last
          />
        </Card>

        <AppText variant="caption" color={colors.muted} style={styles.sectionLabel}>
          ACCOUNT
        </AppText>
        <PrimaryButton
          label="Sign out"
          tone="dark"
          icon={<LogOut size={16} color="#FFFFFF" />}
          onPress={handleSignOut}
          style={styles.action}
        />
        <Pressable
          onPress={handleDelete}
          disabled={busy === 'delete'}
          style={({ pressed }) => [styles.delete, pressed && { opacity: 0.7 }]}>
          <Trash2 size={16} color={colors.danger} />
          <AppText variant="label" color={colors.danger}>
            {busy === 'delete' ? 'Deleting…' : 'Delete account'}
          </AppText>
        </Pressable>

        <View style={styles.info}>
          <ShieldAlert size={15} color={colors.muted} />
          <AppText variant="caption" color={colors.muted} style={styles.infoText}>
            Deleting your account voids unused passes and revokes access immediately. Contact the
            club if you need help with an existing refund.
          </AppText>
        </View>

        <AppText variant="caption" color={colors.muted} style={styles.version}>
          KICKOFF MEMBER APP · v0.1.0
        </AppText>
      </ScrollView>
    </Screen>
  );
}

function LegalRow({
  label,
  onPress,
  last,
}: {
  label: string;
  onPress: () => void;
  last?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.row, last && { borderBottomWidth: 0 }, pressed && { opacity: 0.7 }]}>
      <AppText variant="label" style={styles.flex}>
        {label}
      </AppText>
      <AppText variant="label" color={colors.muted}>
        ›
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingHorizontal: 20, paddingBottom: 48 },
  sectionLabel: { fontSize: 9, letterSpacing: 1, marginTop: 22, marginBottom: 9, marginLeft: 2 },
  card: { paddingHorizontal: 14 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  flex: { flex: 1 },
  rowDetail: { fontSize: 11, marginTop: 2 },
  hint: { paddingBottom: 12, fontSize: 10 },
  action: { marginTop: 2 },
  delete: {
    marginTop: 12,
    minHeight: 50,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: '#FECACA',
    backgroundColor: '#FFF5F5',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  info: { flexDirection: 'row', gap: 8, marginTop: 18, paddingHorizontal: 2 },
  infoText: { flex: 1, lineHeight: 15 },
  version: { textAlign: 'center', fontSize: 8, letterSpacing: 0.8, marginTop: 24 },
});
