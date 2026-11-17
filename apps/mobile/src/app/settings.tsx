import { LogOut, ShieldAlert, Trash2 } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { AppText, Card, PrimaryButton, Screen, ScreenHeader } from '@/components/ui';
import { useTranslator } from '@/lib/i18n';
import { api, errorMessage } from '@/lib/api';
import { resetLocalSession, signOut } from '@/lib/auth';
import {
  listDeviceRegistrations,
  pushSupported,
  pushUnavailableReason,
  registerPushToken,
  unregisterPushToken,
} from '@/lib/notifications';
import { colors, radii } from '@/lib/theme';

export default function SettingsScreen() {
  const t = useTranslator();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState<'notifications' | 'delete' | null>(null);

  const devicesQuery = useQuery({
    queryKey: ['devices'],
    queryFn: listDeviceRegistrations,
    enabled: pushSupported(),
  });
  const notificationsOn = (devicesQuery.data?.length ?? 0) > 0;
  // Why the switch may be off-limits (no device, running in Expo Go, or no
  // EAS project id). One source of truth — the screen only renders it.
  const unavailable = pushUnavailableReason();

  const toggleNotifications = async (next: boolean) => {
    setBusy('notifications');
    try {
      if (next) await registerPushToken();
      else await unregisterPushToken();
      await devicesQuery.refetch();
    } catch (error) {
      Alert.alert(t('Notifications'), errorMessage(error));
    } finally {
      setBusy(null);
    }
  };

  const handleSignOut = () => {
    Alert.alert(
      t('Sign out?'),
      "You'll need to sign in again to access your passes. Offline copies on this device are removed.",
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: t('Sign out'),
          style: 'destructive',
          onPress: () => {
            void signOut()
              .then(() => router.replace('/(auth)/welcome'))
              .catch((error) => Alert.alert(t('Sign out failed'), errorMessage(error)));
          },
        },
      ],
    );
  };

  const handleDelete = () => {
    Alert.alert(
      t('Delete account?'),
      'Your account will be closed, unused passes voided and personal details removed. This cannot be undone. The request is recorded in the club audit log.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: t('Delete account'),
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
              .catch((error) => Alert.alert(t('Could not delete account'), errorMessage(error)))
              .finally(() => setBusy(null));
          },
        },
      ],
    );
  };

  return (
    <Screen>
      <ScreenHeader title={t('Settings')} subtitle="Account" onBack={() => router.back()} />
      <ScrollView contentContainerStyle={styles.scroll}>
        <AppText variant="caption" color={colors.muted} style={styles.sectionLabel}>{t('NOTIFICATIONS')}</AppText>
        <Card style={styles.card}>
          <View style={styles.row}>
            <View style={styles.flex}>
              <AppText variant="label">{t('Match reminders')}</AppText>
              <AppText variant="small" color={colors.muted} style={styles.rowDetail}>{t('Kick-off reminders 24 hours and 2 hours before home matches.')}</AppText>
            </View>
            <Switch
              value={notificationsOn}
              onValueChange={(next) => void toggleNotifications(next)}
              disabled={busy !== null || unavailable !== null || devicesQuery.isLoading}
              trackColor={{ false: colors.line, true: colors.primary }}
              thumbColor="#FFFFFF"
            />
          </View>
          {unavailable ? (
            <AppText variant="caption" color={colors.muted} style={styles.hint}>
              {unavailable}
            </AppText>
          ) : null}
        </Card>

        <AppText variant="caption" color={colors.muted} style={styles.sectionLabel}>{t('PREFERENCES')}</AppText>
        <Card style={styles.card}>
          <View style={styles.row}>
            <View style={styles.flex}>
              <AppText variant="label">{t('Language')}</AppText>
              <AppText variant="small" color={colors.muted} style={styles.rowDetail}>{t('More languages coming soon')}</AppText>
            </View>
            <AppText variant="label" color={colors.primary}>
              English
            </AppText>
          </View>
        </Card>

        <AppText variant="caption" color={colors.muted} style={styles.sectionLabel}>{t('LEGAL')}</AppText>
        <Card style={styles.card}>
          <LegalRow label={t('Terms of use')} onPress={() => router.push('/legal/terms')} />
          <LegalRow label={t('Privacy policy')} onPress={() => router.push('/legal/privacy')} />
          <LegalRow
            label={t('Refund policy')}
            onPress={() => router.push('/legal/refund')}
            last
          />
        </Card>

        <AppText variant="caption" color={colors.muted} style={styles.sectionLabel}>{t('ACCOUNT')}</AppText>
        <PrimaryButton
          label={t('Sign out')}
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
          <AppText variant="caption" color={colors.muted} style={styles.infoText}>{t('Deleting your account voids unused passes, revokes access immediately and writes an audit record for the club. Contact the club if you need help with an existing refund.')}</AppText>
        </View>

        <AppText variant="caption" color={colors.muted} style={styles.version}>{t('KICKOFF MEMBER APP · v0.1.0')}</AppText>
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
