import { ChevronLeft, Download, ReceiptText } from 'lucide-react-native';
import * as WebBrowser from 'expo-web-browser';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { formatTHB, formatShortDate, type OrderDto } from '@kickoff/shared';
import { AppText, Card, EmptyState, Pill, Screen, Skeleton } from '@/components/ui';
import { errorMessage } from '@/lib/api';
import { useCancelOrder, useOrders } from '@/lib/queries/orders';
import { useProfile } from '@/lib/queries/profile';
import { downloadAndShareReceipt } from '@/lib/receipt';
import { colors, radii } from '@/lib/theme';

const POLL_INTERVAL_MS = 2500;

export default function OrdersScreen() {
  const router = useRouter();
  const { checkout, order_id } = useLocalSearchParams<{ checkout?: string; order_id?: string }>();
  const ordersQuery = useOrders({
    // Keep polling only until Stripe's webhook has settled every pending order.
    refetchInterval: (query) =>
      checkout === 'success' && (query.state.data ?? []).some((order) => order.status === 'pending')
        ? POLL_INTERVAL_MS
        : false,
  });
  const profileQuery = useProfile();
  const cancelOrder = useCancelOrder();
  const [busyId, setBusyId] = useState<string | null>(null);

  // When returning from a cancelled Stripe session, free the seats immediately.
  useEffect(() => {
    if (checkout === 'cancelled' && order_id) {
      void cancelOrder.mutateAsync(order_id).catch(() => undefined);
    }
  }, [checkout, order_id]); // eslint-disable-line react-hooks/exhaustive-deps

  const orders = ordersQuery.data ?? [];
  const paidOrders = orders.filter((order) => order.status === 'paid');

  const downloadReceipt = async (order: OrderDto) => {
    setBusyId(order.id);
    try {
      await downloadAndShareReceipt(order.id);
    } catch (error) {
      Alert.alert('Could not open receipt', errorMessage(error));
    } finally {
      setBusyId(null);
    }
  };

  const refresh = () => void ordersQuery.refetch();

  return (
    <Screen>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.iconButton}>
          <ChevronLeft size={21} color={colors.text} />
        </Pressable>
        <View style={styles.headerCenter}>
          <AppText variant="h3">Orders & receipts</AppText>
          <AppText variant="caption" color={colors.muted} style={styles.headerSub}>
            {orders.length} {orders.length === 1 ? 'ORDER' : 'ORDERS'} · {profileQuery.data?.fullName?.toUpperCase() ?? 'KICKOFF MEMBER'}
          </AppText>
        </View>
        <View style={styles.spacer} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl
            refreshing={ordersQuery.isRefetching}
            onRefresh={refresh}
            tintColor={colors.primary}
          />
        }>
        {checkout === 'success' ? (
          <Card style={styles.banner}>
            <ReceiptText size={18} color={colors.primary} />
            <AppText variant="small" color={colors.primary} style={styles.bannerText}>
              Payment received. Your passes appear as soon as Stripe confirms the payment.
            </AppText>
          </Card>
        ) : null}
        {checkout === 'cancelled' ? (
          <Card style={styles.banner}>
            <ReceiptText size={18} color={colors.warning} />
            <AppText variant="small" color={colors.warning} style={styles.bannerText}>
              Payment was cancelled. You were not charged.
            </AppText>
          </Card>
        ) : null}

        <Card style={styles.summary}>
          <View style={styles.summaryIcon}>
            <ReceiptText size={22} color={colors.primary} />
          </View>
          <View style={styles.flex}>
            <AppText variant="label">Lifetime ticket spend</AppText>
            <AppText variant="h2" style={styles.summaryTotal}>
              {formatTHB(paidOrders.reduce((sum, order) => sum + order.amountSatang, 0))}
            </AppText>
          </View>
          <Pill label="THB" tone="gold" />
        </Card>

        {ordersQuery.isLoading ? (
          <View style={styles.skeletons}>
            <Skeleton height={160} radius={18} />
            <Skeleton height={160} radius={18} />
          </View>
        ) : orders.length === 0 ? (
          <Card style={styles.emptyCard}>
            <EmptyState
              title="No orders yet"
              description="Match passes and receipts will appear here after your first purchase."
            />
          </Card>
        ) : (
          orders.map((order) => (
            <Card key={order.id} style={styles.order}>
              <View style={styles.orderTop}>
                <View style={styles.flex}>
                  <AppText variant="caption" color={colors.primary} style={styles.orderLabel}>
                    ORDER · {order.id.slice(-6).toUpperCase()}
                  </AppText>
                  <AppText variant="h3" style={styles.orderTitle}>
                    {order.matchLabel}
                  </AppText>
                  <AppText variant="small" color={colors.muted}>
                    Placed {formatShortDate(order.createdAt)} · {order.seats.length}{' '}
                    {order.seats.length === 1 ? 'ticket' : 'tickets'}
                  </AppText>
                </View>
                <Pill
                  label={order.status.toUpperCase()}
                  tone={
                    order.status === 'paid'
                      ? 'green'
                      : order.status === 'pending'
                        ? 'gold'
                        : 'muted'
                  }
                />
              </View>

              <View style={styles.dashed} />

              {order.seats.map((seat) => (
                <View key={seat.seatId} style={styles.itemRow}>
                  <View style={styles.itemInfo}>
                    <AppText variant="label">{seat.zoneName}</AppText>
                    <AppText variant="caption" color={colors.muted} style={styles.itemMeta}>
                      ROW {seat.row} · SEAT {seat.number}
                    </AppText>
                  </View>
                  <AppText variant="label">{formatTHB(seat.priceSatang)}</AppText>
                </View>
              ))}

              <View style={styles.totalRow}>
                <AppText variant="small" color={colors.muted}>
                  {order.status === 'paid' ? 'Total paid' : 'Total'} ·{' '}
                  {order.paymentRef ?? order.id.slice(-6).toUpperCase()}
                </AppText>
                <AppText variant="h3">{formatTHB(order.amountSatang)}</AppText>
              </View>

              <View style={styles.actions}>
                {order.status === 'paid' ? (
                  <Pressable
                    onPress={() => void downloadReceipt(order)}
                    disabled={busyId === order.id}
                    style={({ pressed }) => [styles.download, pressed && { opacity: 0.75 }]}>
                    <Download size={15} color={colors.primary} />
                    <AppText variant="label" color={colors.primary}>
                      {busyId === order.id ? 'Preparing…' : 'Download PDF receipt'}
                    </AppText>
                  </Pressable>
                ) : (
                  <View style={[styles.download, { opacity: 0.5 }]}>
                    <ReceiptText size={15} color={colors.muted} />
                    <AppText variant="label" color={colors.muted}>
                      Receipt after payment
                    </AppText>
                  </View>
                )}
                {order.status === 'pending' && order.checkoutUrl ? (
                  <Pressable
                    onPress={() => void WebBrowser.openBrowserAsync(order.checkoutUrl!)}
                    style={styles.viewTickets}>
                    <AppText variant="label" color={colors.primary}>
                      Resume payment
                    </AppText>
                  </Pressable>
                ) : null}
                {order.status === 'pending' ? (
                  <Pressable
                    onPress={() => {
                      setBusyId(order.id);
                      void cancelOrder
                        .mutateAsync(order.id)
                        .catch((e) => Alert.alert('Could not cancel', errorMessage(e)))
                        .finally(() => setBusyId(null));
                    }}
                    disabled={busyId === order.id || cancelOrder.isPending}
                    style={styles.viewTickets}>
                    <AppText variant="label" color={colors.warning}>
                      {busyId === order.id ? 'Cancelling…' : 'Cancel order'}
                    </AppText>
                  </Pressable>
                ) : null}
                <Pressable
                  onPress={() =>
                    router.push({ pathname: '/orders/[id]', params: { id: order.id } })
                  }
                  style={styles.viewTickets}>
                  <AppText variant="label" color={colors.muted}>
                    Details
                  </AppText>
                </Pressable>
              </View>
            </Card>
          ))
        )}

        <AppText variant="caption" color={colors.muted} style={styles.note}>
          RECEIPTS ARE GENERATED SECURELY BY KICKOFF AND INCLUDE VAT. PAYMENTS ARE PROCESSED BY
          STRIPE.
        </AppText>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 10,
    gap: 10,
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  spacer: { width: 40 },
  headerCenter: { flex: 1, alignItems: 'center', gap: 1 },
  headerSub: { fontSize: 8, letterSpacing: 0.8 },
  scroll: { paddingHorizontal: 20, paddingBottom: 40 },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 13,
    marginBottom: 12,
    backgroundColor: colors.softGreen,
    borderColor: colors.line,
  },
  bannerText: { flex: 1, lineHeight: 16 },
  summary: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 15, marginBottom: 14 },
  summaryIcon: {
    width: 46,
    height: 46,
    borderRadius: 14,
    backgroundColor: colors.softGreen,
    alignItems: 'center',
    justifyContent: 'center',
  },
  flex: { flex: 1 },
  summaryTotal: { fontSize: 25, lineHeight: 28, marginTop: 1 },
  skeletons: { gap: 12 },
  emptyCard: { padding: 8 },
  order: { padding: 15, marginBottom: 12 },
  orderTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  orderLabel: { fontSize: 8, letterSpacing: 0.8, marginBottom: 3 },
  orderTitle: { fontSize: 19, lineHeight: 22, marginBottom: 2 },
  dashed: {
    borderTopWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.line,
    marginVertical: 13,
  },
  itemRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6 },
  itemInfo: { flex: 1 },
  itemMeta: { fontSize: 8, letterSpacing: 0.6, marginTop: 1 },
  totalRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    paddingTop: 12,
    marginTop: 6,
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  actions: { flexDirection: 'row', gap: 8, marginTop: 14 },
  download: {
    flex: 1,
    minHeight: 44,
    borderRadius: radii.md,
    backgroundColor: colors.softGreen,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 7,
  },
  viewTickets: {
    minHeight: 44,
    paddingHorizontal: 14,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  note: { fontSize: 8, lineHeight: 13, letterSpacing: 0.6, textAlign: 'center', marginTop: 18 },
});
