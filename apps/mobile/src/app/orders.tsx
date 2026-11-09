import { ChevronLeft, Download, ReceiptText } from 'lucide-react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { formatFullDate, formatTHB, formatShortDate, type Order } from '@xclub/shared';
import { AppText, Card, Pill, Screen } from '@/components/ui';
import { useMockCommerce } from '@/lib/mock-commerce';
import { useApp } from '@/lib/store';
import { colors, fonts, radii } from '@/lib/theme';

export default function OrdersScreen() {
  const router = useRouter();
  const { orders } = useMockCommerce();
  const { profile } = useApp();
  const [busyId, setBusyId] = useState<string | null>(null);
  const sorted = [...orders].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

  const downloadReceipt = async (order: Order) => {
    setBusyId(order.id);
    try {
      const html = buildReceiptHtml(order, profile?.fullName ?? 'XClub Supporter', profile?.email ?? '');
      if (Platform.OS === 'web') {
        await Print.printAsync({ html });
      } else {
        const { uri } = await Print.printToFileAsync({ html });
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(uri, {
            mimeType: 'application/pdf',
            dialogTitle: 'XClub receipt',
            UTI: 'com.adobe.pdf',
          });
        } else {
          Alert.alert('Receipt saved', uri);
        }
      }
    } catch {
      Alert.alert('Could not create receipt', 'Please try again.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Screen>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.iconButton}>
          <ChevronLeft size={21} color={colors.text} />
        </Pressable>
        <View style={styles.headerCenter}>
          <AppText variant="h3">Orders & receipts</AppText>
          <AppText variant="caption" color={colors.muted} style={styles.headerSub}>
            {orders.length} MOCK ORDERS
          </AppText>
        </View>
        <View style={styles.spacer} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        <Card style={styles.summary}>
          <View style={styles.summaryIcon}>
            <ReceiptText size={22} color={colors.primary} />
          </View>
          <View style={styles.flex}>
            <AppText variant="label">Lifetime ticket spend</AppText>
            <AppText variant="h2" style={styles.summaryTotal}>
              {formatTHB(orders.reduce((sum, order) => sum + order.amountSatang, 0))}
            </AppText>
          </View>
          <Pill label="THB" tone="gold" />
        </Card>

        {sorted.map((order) => (
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
              <Pill label={order.status.toUpperCase()} tone={order.status === 'paid' ? 'green' : 'muted'} />
            </View>

            <View style={styles.dashed} />

            {order.seats.map((seat) => (
              <View key={seat.ticketId} style={styles.itemRow}>
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
                Total paid · {order.paymentRef}
              </AppText>
              <AppText variant="h3">{formatTHB(order.amountSatang)}</AppText>
            </View>

            <View style={styles.actions}>
              <Pressable
                onPress={() => downloadReceipt(order)}
                disabled={busyId === order.id}
                style={({ pressed }) => [styles.download, pressed && { opacity: 0.75 }]}>
                <Download size={15} color={colors.primary} />
                <AppText variant="label" color={colors.primary}>
                  {busyId === order.id ? 'Preparing…' : 'Download PDF receipt'}
                </AppText>
              </Pressable>
              <Pressable onPress={() => router.push('/tickets')} style={styles.viewTickets}>
                <AppText variant="label" color={colors.muted}>
                  View tickets
                </AppText>
              </Pressable>
            </View>
          </Card>
        ))}

        <AppText variant="caption" color={colors.muted} style={styles.note}>
          RECEIPTS ARE GENERATED LOCALLY FROM MOCK ORDER DATA. STRIPE TEST RECEIPTS REPLACE THIS IN
          PHASE C.
        </AppText>
      </ScrollView>
    </Screen>
  );
}

function buildReceiptHtml(order: Order, holder: string, email: string): string {
  const rows = order.seats
    .map(
      (seat) => `
      <tr>
        <td>${seat.zoneName}</td>
        <td>Row ${seat.row} · Seat ${seat.number}</td>
        <td style="text-align:right">฿${(seat.priceSatang / 100).toFixed(2)}</td>
      </tr>`,
    )
    .join('');

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<style>
  body { font-family: -apple-system, Helvetica, Arial, sans-serif; color: #0F172A; padding: 40px; }
  .brand { color: #0B6B3A; font-size: 28px; font-weight: 800; letter-spacing: 2px; margin: 0; }
  .tag { color: #64748B; font-size: 10px; letter-spacing: 1.4px; margin-top: 4px; }
  .rule { border-top: 2px solid #0B6B3A; margin: 24px 0; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  .muted { color: #64748B; font-size: 12px; }
  table { width: 100%; border-collapse: collapse; margin-top: 24px; font-size: 13px; }
  th { text-align: left; color: #64748B; font-size: 10px; letter-spacing: 1px; border-bottom: 1px solid #E2E8F0; padding: 8px 0; }
  td { padding: 10px 0; border-bottom: 1px solid #F1F5F9; }
  .total { margin-top: 20px; display: flex; justify-content: space-between; font-size: 18px; font-weight: 700; }
  .badge { display: inline-block; background: #E7F4EC; color: #0B6B3A; padding: 4px 10px; border-radius: 20px; font-size: 10px; font-weight: 700; }
  .footer { margin-top: 36px; color: #94A3B8; font-size: 10px; line-height: 1.6; }
</style>
</head>
<body>
  <p class="brand">XCLUB</p>
  <p class="tag">OFFICIAL MATCH TICKET RECEIPT</p>
  <div class="rule"></div>
  <h1>${order.matchLabel}</h1>
  <p class="muted">Order ${order.id} · ${formatFullDate(order.createdAt)}</p>
  <p class="muted">Ticket holder: ${holder}${email ? ` · ${email}` : ''}</p>
  <p><span class="badge">PAID · STRIPE TEST MODE</span></p>
  <table>
    <thead><tr><th>Stand</th><th>Seat</th><th style="text-align:right">Price</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <div class="total"><span>Total paid</span><span>฿${(order.amountSatang / 100).toFixed(2)}</span></div>
  <div class="footer">
    Payment reference: ${order.paymentRef}<br />
    This is a mock receipt generated by the Phase A UI prototype. It is not valid as proof of purchase.<br />
    XClub Arena · Bangkok · Thailand
  </div>
</body>
</html>`;
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
  font: { fontFamily: fonts.bold },
});
