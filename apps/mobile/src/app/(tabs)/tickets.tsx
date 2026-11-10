import { ChevronRight, ReceiptText, Ticket as TicketIcon } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { formatMatchDate, formatTHB } from '@xclub/shared';
import { TicketCard } from '@/components/ticket-card';
import {
  AppText,
  Card,
  LiveTag,
  PageScroll,
  PrimaryButton,
  Screen,
  Skeleton,
} from '@/components/ui';
import { useOrders } from '@/lib/queries/orders';
import { useTickets } from '@/lib/queries/tickets';
import { colors, radii } from '@/lib/theme';

export default function TicketsScreen() {
  const router = useRouter();
  const ticketsQuery = useTickets();
  const ordersQuery = useOrders();
  const [tab, setTab] = useState<'active' | 'past'>('active');

  const tickets = ticketsQuery.data ?? [];
  const orders = ordersQuery.data ?? [];
  const paidOrders = orders.filter((order) => order.status === 'paid');

  const active = tickets
    .filter((ticket) => ticket.status === 'valid')
    .sort((a, b) => new Date(a.kickoffAt).getTime() - new Date(b.kickoffAt).getTime());
  const past = tickets
    .filter((ticket) => ticket.status !== 'valid')
    .sort((a, b) => new Date(b.kickoffAt).getTime() - new Date(a.kickoffAt).getTime());
  const shown = tab === 'active' ? active : past;
  const loading = ticketsQuery.isLoading || ordersQuery.isLoading;
  const refreshing = ticketsQuery.isRefetching || ordersQuery.isRefetching;

  const refresh = () => {
    void ticketsQuery.refetch();
    void ordersQuery.refetch();
  };

  return (
    <Screen>
      <PageScroll
        bottom={118}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.primary} />
        }>
        <View style={styles.header}>
          <View>
            <AppText variant="caption" color={colors.primary} style={styles.eyebrow}>
              DIGITAL MATCH PASSES
            </AppText>
            <AppText variant="title" style={styles.title}>
              My tickets
            </AppText>
          </View>
          <LiveTag />
        </View>

        <View style={styles.segmented}>
          <Segment
            label={`Active · ${active.length}`}
            active={tab === 'active'}
            onPress={() => setTab('active')}
          />
          <Segment
            label={`Past · ${past.length}`}
            active={tab === 'past'}
            onPress={() => setTab('past')}
          />
        </View>

        {loading ? (
          <View style={styles.list}>
            <Skeleton height={172} radius={18} />
            <Skeleton height={172} radius={18} />
          </View>
        ) : shown.length ? (
          <View style={styles.list}>
            {shown.map((ticket) => (
              <TicketCard
                key={ticket.id}
                ticket={ticket}
                onPress={() =>
                  router.push({ pathname: '/ticket/[id]', params: { id: ticket.id } })
                }
              />
            ))}
          </View>
        ) : (
          <Card style={styles.empty}>
            <View style={styles.emptyIcon}>
              <TicketIcon size={26} color={colors.primary} />
            </View>
            <AppText variant="h3" style={styles.emptyTitle}>
              No {tab} tickets yet
            </AppText>
            <AppText variant="small" color={colors.muted} style={styles.emptyText}>
              Pick an upcoming fixture, choose your exact seat, and your pass will appear here.
            </AppText>
            <PrimaryButton
              label="Browse fixtures"
              onPress={() => router.push('/(tabs)')}
              style={styles.emptyButton}
            />
          </Card>
        )}

        <Pressable
          onPress={() => router.push('/orders')}
          style={({ pressed }) => [styles.orderRow, pressed && { opacity: 0.8 }]}>
          <View style={styles.orderIcon}>
            <ReceiptText size={20} color={colors.primary} />
          </View>
          <View style={styles.flex}>
            <AppText variant="label">Order history</AppText>
            <AppText variant="small" color={colors.muted}>
              {paidOrders.length} paid {paidOrders.length === 1 ? 'order' : 'orders'} · receipts
              available
            </AppText>
          </View>
          <View style={styles.orderTotal}>
            <AppText variant="caption" color={colors.muted} style={styles.orderTotalLabel}>
              TOTAL
            </AppText>
            <AppText variant="label">
              {formatTHB(paidOrders.reduce((sum, order) => sum + order.amountSatang, 0))}
            </AppText>
          </View>
          <ChevronRight size={18} color={colors.muted} />
        </Pressable>

        <Card style={styles.info}>
          <View style={styles.infoDot} />
          <View style={styles.flex}>
            <AppText variant="label">Keep your pass ready</AppText>
            <AppText variant="small" color={colors.muted} style={styles.infoText}>
              Open your pass before you reach the gate so the signed QR is ready. Each pass admits
              one entry and is validated live by the scanner.
            </AppText>
          </View>
        </Card>

        {active[0] ? (
          <View style={styles.hintRow}>
            <AppText variant="caption" color={colors.muted} style={styles.hintText}>
              NEXT ENTRY · {formatMatchDate(active[0].kickoffAt).toUpperCase()} ·{' '}
              {active[0].venue.toUpperCase()}
            </AppText>
          </View>
        ) : null}
      </PageScroll>
    </Screen>
  );
}

function Segment({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={[styles.segment, active && styles.segmentActive]}>
      <AppText variant="label" color={active ? '#FFFFFF' : colors.muted} style={styles.segmentText}>
        {label}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: 20,
    paddingTop: 14,
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  eyebrow: { fontSize: 9, letterSpacing: 1.1, marginBottom: 4 },
  title: { fontSize: 37 },
  segmented: {
    flexDirection: 'row',
    marginHorizontal: 20,
    marginTop: 20,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radii.md,
    padding: 4,
    gap: 4,
  },
  segment: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: 'center',
  },
  segmentActive: { backgroundColor: colors.primary },
  segmentText: { fontSize: 12 },
  list: { paddingHorizontal: 20, paddingTop: 18, gap: 12 },
  empty: { marginHorizontal: 20, marginTop: 18, padding: 24, alignItems: 'center' },
  emptyIcon: {
    width: 60,
    height: 60,
    borderRadius: 20,
    backgroundColor: colors.softGreen,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  emptyTitle: { textAlign: 'center' },
  emptyText: { textAlign: 'center', marginTop: 6, maxWidth: 260 },
  emptyButton: { marginTop: 16, alignSelf: 'stretch' },
  orderRow: {
    marginHorizontal: 20,
    marginTop: 22,
    backgroundColor: '#FFFFFF',
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
  },
  orderIcon: {
    width: 42,
    height: 42,
    borderRadius: 13,
    backgroundColor: colors.softGreen,
    alignItems: 'center',
    justifyContent: 'center',
  },
  flex: { flex: 1 },
  orderTotal: { alignItems: 'flex-end' },
  orderTotalLabel: { fontSize: 7, letterSpacing: 0.7 },
  info: {
    marginHorizontal: 20,
    marginTop: 14,
    padding: 14,
    flexDirection: 'row',
    gap: 10,
    backgroundColor: colors.softGold,
    borderColor: '#F3E3A7',
  },
  infoDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.warning,
    marginTop: 5,
  },
  infoText: { marginTop: 3, fontSize: 11, lineHeight: 16 },
  hintRow: { marginTop: 22, paddingHorizontal: 20, alignItems: 'center' },
  hintText: { fontSize: 8, letterSpacing: 0.8 },
});
