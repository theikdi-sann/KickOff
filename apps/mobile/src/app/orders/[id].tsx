import { Download, ReceiptText } from 'lucide-react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { formatFullDate, formatTHB } from '@kickoff/shared';
import {
  AppText,
  Card,
  EmptyState,
  Pill,
  Screen,
  ScreenHeader,
  Skeleton,
} from '@/components/ui';
import { errorMessage } from '@/lib/api';
import { useOrder } from '@/lib/queries/orders';
import { useProfile } from '@/lib/queries/profile';
import { downloadAndShareReceipt } from '@/lib/receipt';
import { colors, radii } from '@/lib/theme';

export default function OrderDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const orderQuery = useOrder(id);
  const profileQuery = useProfile();
  const [busy, setBusy] = useState(false);
  const order = orderQuery.data;

  const receipt = async () => {
    if (!order) return;
    setBusy(true);
    try {
      await downloadAndShareReceipt(order.id);
    } catch (error) {
      Alert.alert('Could not open receipt', errorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  if (orderQuery.isLoading) {
    return (
      <Screen>
        <ScreenHeader title="Order" subtitle="Receipt" onBack={() => router.back()} />
        <View style={styles.loading}>
          <Skeleton height={150} radius={18} />
          <Skeleton height={200} radius={18} />
        </View>
      </Screen>
    );
  }

  if (!order) {
    return (
      <Screen>
        <ScreenHeader title="Order" subtitle="Receipt" onBack={() => router.back()} />
        <View style={styles.loading}>
          <EmptyState
            title="Order not found"
            description={
              orderQuery.error instanceof Error
                ? orderQuery.error.message
                : 'This order could not be loaded.'
            }
          />
        </View>
      </Screen>
    );
  }

  const paid = order.status === 'paid';

  return (
    <Screen>
      <ScreenHeader title="Order" subtitle="Receipt" onBack={() => router.back()} />
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Card style={styles.card}>
          <View style={styles.top}>
            <View style={styles.flex}>
              <AppText variant="caption" color={colors.primary} style={styles.label}>
                ORDER · {order.id.slice(-6).toUpperCase()}
              </AppText>
              <AppText variant="h2" style={styles.title}>
                {order.matchLabel}
              </AppText>
              <AppText variant="small" color={colors.muted}>
                Placed {formatFullDate(order.createdAt)}
              </AppText>
            </View>
            <Pill
              label={order.status.toUpperCase()}
              tone={paid ? 'green' : order.status === 'pending' ? 'gold' : 'muted'}
            />
          </View>

          <View style={styles.dashed} />

          {order.seats.map((seat) => (
            <View key={seat.seatId} style={styles.row}>
              <View style={styles.flex}>
                <AppText variant="label">{seat.zoneName}</AppText>
                <AppText variant="caption" color={colors.muted} style={styles.meta}>
                  ROW {seat.row} · SEAT {seat.number}
                </AppText>
              </View>
              <AppText variant="label">{formatTHB(seat.priceSatang)}</AppText>
            </View>
          ))}

          <View style={styles.total}>
            <AppText variant="small" color={colors.muted}>
              {paid ? 'Total paid' : 'Total'}
            </AppText>
            <AppText variant="h2">{formatTHB(order.amountSatang)}</AppText>
          </View>
        </Card>

        <AppText variant="caption" color={colors.muted} style={styles.sectionLabel}>
          PAYMENT
        </AppText>
        <Card style={styles.card}>
          <DetailRow label="Status" value={order.status.toUpperCase()} />
          <DetailRow label="Reference" value={order.paymentRef ?? '—'} />
          <DetailRow label="Paid at" value={order.paidAt ? formatFullDate(order.paidAt) : '—'} />
          <DetailRow label="Ticket holder" value={profileQuery.data?.fullName ?? '—'} last />
        </Card>

        {paid ? (
          <Pressable
            onPress={() => void receipt()}
            disabled={busy}
            style={({ pressed }) => [styles.download, pressed && { opacity: 0.75 }]}>
            <Download size={16} color={colors.primary} />
            <AppText variant="label" color={colors.primary}>
              {busy ? 'Preparing…' : 'Download PDF receipt'}
            </AppText>
          </Pressable>
        ) : (
          <View style={[styles.download, { opacity: 0.55 }]}>
            <ReceiptText size={16} color={colors.muted} />
            <AppText variant="label" color={colors.muted}>
              Receipt available after payment
            </AppText>
          </View>
        )}

        <Pressable onPress={() => router.push('/tickets')} style={styles.link}>
          <AppText variant="label" color={colors.primary}>
            View my tickets
          </AppText>
        </Pressable>
      </ScrollView>
    </Screen>
  );
}

function DetailRow({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <View style={[styles.detailRow, last && { borderBottomWidth: 0 }]}>
      <AppText variant="small" color={colors.muted}>
        {label}
      </AppText>
      <AppText variant="label" numberOfLines={1} style={styles.detailValue}>
        {value}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  loading: { padding: 20, gap: 14 },
  scroll: { paddingHorizontal: 20, paddingBottom: 48 },
  card: { padding: 16 },
  top: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  flex: { flex: 1 },
  label: { fontSize: 8, letterSpacing: 0.8, marginBottom: 3 },
  title: { fontSize: 24, lineHeight: 27, marginBottom: 2 },
  dashed: {
    borderTopWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.line,
    marginVertical: 14,
  },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 7 },
  meta: { fontSize: 8, letterSpacing: 0.6, marginTop: 1 },
  total: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    paddingTop: 12,
    marginTop: 8,
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  sectionLabel: { fontSize: 9, letterSpacing: 1, marginTop: 22, marginBottom: 9, marginLeft: 2 },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  detailValue: { flexShrink: 1, textAlign: 'right' },
  download: {
    marginTop: 22,
    minHeight: 50,
    borderRadius: radii.md,
    backgroundColor: colors.softGreen,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  link: { alignItems: 'center', marginTop: 18 },
});
