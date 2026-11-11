import { Lock, ShieldCheck, Timer, X } from 'lucide-react-native';
import { useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import * as WebBrowser from 'expo-web-browser';
import { useLocalSearchParams, useRouter, usePreventRemove } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { formatMatchDate, formatMatchTime, formatTHB } from '@kickoff/shared';
import {
  AppText,
  Card,
  EmptyState,
  Pill,
  PrimaryButton,
  Screen,
  Skeleton,
} from '@/components/ui';
import { errorMessage } from '@/lib/api';
import { useHold, useReleaseHold } from '@/lib/queries/holds';
import { useMatch } from '@/lib/queries/matches';
import { useCancelOrder, useCreateOrder, useOrder } from '@/lib/queries/orders';
import { useProfile } from '@/lib/queries/profile';
import { useSeatMap, useZones } from '@/lib/queries/seats';
import { supabase } from '@/lib/supabase';
import { colors, radii } from '@/lib/theme';

/** How often to check whether the Stripe webhook has confirmed the order. */
const POLL_INTERVAL_MS = 2500;

export default function CheckoutScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    holdId?: string;
    matchId?: string;
    zoneId?: string;
    checkout?: string;
    order_id?: string;
  }>();
  const { holdId, matchId: matchParam, zoneId: zoneParam } = params;
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const [orderId, setOrderId] = useState<string>();
  const [payError, setPayError] = useState<string | null>(null);
  const [panelError, setPanelError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'resume' | 'cancel' | null>(null);
  const [redirecting, setRedirecting] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [exitPrevented, setExitPrevented] = useState(true);

  const holdQuery = useHold(holdId);
  const hold = holdQuery.data;
  const matchQuery = useMatch(hold?.matchId ?? matchParam);
  const zonesQuery = useZones(hold?.matchId ?? matchParam);
  const zone = zonesQuery.data?.find((item) => item.id === zoneParam);
  const seatMapQuery = useSeatMap(zone?.id);
  const profileQuery = useProfile();
  const releaseHold = useReleaseHold();
  const createOrder = useCreateOrder();
  const cancelOrder = useCancelOrder();

  const orderQuery = useOrder(orderId, {
    // Stop polling as soon as the webhook gives the order a final status.
    refetchInterval: (query) => (query.state.data?.status === 'pending' ? POLL_INTERVAL_MS : false),
  });

  const match = matchQuery.data;
  const order = orderQuery.data;

  // `create_order_from_hold` releases the hold, so the order becomes the source
  // of truth for which seats this checkout is for once payment has started.
  const heldSeatIds = useMemo(
    () =>
      new Set(order?.seats.map((seat) => seat.seatId) ?? hold?.seatIds ?? []),
    [order?.seats, hold?.seatIds],
  );
  const seats = useMemo(
    () => (seatMapQuery.data ?? []).filter((seat) => heldSeatIds.has(seat.id)),
    [seatMapQuery.data, heldSeatIds],
  );
  const standName = zone?.name ?? order?.seats[0]?.zoneName ?? '—';
  const seatLabels =
    seats.map((seat) => seat.label).join(', ') ||
    order?.seats.map((seat) => `${seat.row}${seat.number}`).join(', ') ||
    '—';
  const rowLabels = [
    ...new Set(
      seats.length ? seats.map((seat) => seat.row) : (order?.seats.map((seat) => seat.row) ?? []),
    ),
  ].join(', ') || '—';

  const total = order?.amountSatang ?? (zone?.priceSatang ?? 0) * seats.length;

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Once the webhook marks the order paid, issue the passes and leave checkout.
  const navigated = useRef(false);
  useEffect(() => {
    if (order?.status !== 'paid' || navigated.current) return;
    navigated.current = true;
    const ticketId = order.seats.find((seat) => seat.ticketId)?.ticketId;
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
      () => undefined,
    );
    if (ticketId) {
      router.replace({
        pathname: '/ticket/[id]',
        params: { id: ticketId, new: '1', count: String(order.seats.length) },
      });
    } else {
      router.replace('/orders');
    }
  }, [order, router]);

  // ---------------------------------------------------------------------------
  // One exit handler for every gesture: the X button dispatches a plain back,
  // and the navigator funnels swipe-down, Android back and edge-swipe through
  // the same interceptor below — all of them behave identically.
  // ---------------------------------------------------------------------------
  const exitStarted = useRef(false);
  const holdReleased = useRef(false);
  const orderIdRef = useRef<string | undefined>(undefined);
  const holdIdRef = useRef<string | undefined>(holdId);

  useEffect(() => {
    orderIdRef.current = orderId;
    holdIdRef.current = holdId;
  });

  const runExit = async () => {
    if (exitStarted.current) return;
    exitStarted.current = true;
    // Backing out before paying must not keep other supporters locked out.
    // Once an order exists the seats stay reserved (auto-freed at expiry) and
    // the seat map shows them as "Reserved by you".
    if (orderIdRef.current || !holdIdRef.current) return;
    try {
      await releaseHold.mutateAsync(holdIdRef.current);
      holdReleased.current = true;
    } catch {
      // Retried by the unmount safety net below.
    }
  };

  usePreventRemove(exitPrevented, ({ repeat }) => {
    // A first exit attempt is already in flight — let it perform the repeat.
    if (exitStarted.current) return;
    void runExit().finally(() => {
      setExitPrevented(false);
      repeat();
    });
  });

  // Safety net: if a removal path ever bypasses the interceptor (for example a
  // native sheet dismiss), a stray pre-payment hold is released on unmount so
  // no seat is ever stranded, and the seat map always refetches on the way back.
  useEffect(() => {
    return () => {
      void queryClient.invalidateQueries({ queryKey: ['seats'] });
      void queryClient.invalidateQueries({ queryKey: ['my-holds'] });
      if (holdReleased.current || orderIdRef.current || !holdIdRef.current) return;
      const id = holdIdRef.current;
      void (async () => {
        try {
          const res = await supabase.rpc('release_hold', { p_hold_id: id });
          if (!res.error) holdReleased.current = true;
        } catch {
          // Network failure — the hold frees itself at its TTL.
        } finally {
          void queryClient.invalidateQueries({ queryKey: ['seats'] });
          void queryClient.invalidateQueries({ queryKey: ['my-holds'] });
        }
      })();
    };
  }, [queryClient]);

  const orderExpiresMs = order?.expiresAt ? new Date(order.expiresAt).getTime() : 0;
  const holdExpiresMs = hold ? new Date(hold.expiresAt).getTime() : 0;
  const expiresMs = orderId ? orderExpiresMs || holdExpiresMs : holdExpiresMs;
  const secondsLeft = Math.max(0, Math.floor((expiresMs - now) / 1000));
  const holdExpired = !orderId && Boolean(hold) && secondsLeft === 0;
  // The Stripe browser has been opened (or dismissed): the order exists and is
  // awaiting the webhook — never a blind spinner, always the pending panel.
  const orderPending = Boolean(orderId) && (!order || order.status === 'pending');
  const processing = createOrder.isPending || redirecting;
  const paymentStopped = Boolean(order && order.status !== 'pending' && order.status !== 'paid');
  const reservedClock = expiresMs ? formatMatchTime(new Date(expiresMs).toISOString()) : '—';

  const handlePay = async () => {
    if (!holdId) return;
    setPayError(null);
    try {
      const result = await createOrder.mutateAsync(holdId);
      setOrderId(result.orderId);
      setRedirecting(true);
      if (Platform.OS === 'web') {
        await WebBrowser.openBrowserAsync(result.url, { showTitle: false });
      } else {
        await WebBrowser.openAuthSessionAsync(result.url, 'kickoff://orders');
      }
    } catch (error) {
      setPayError(errorMessage(error));
    } finally {
      setRedirecting(false);
    }
  };

  const handleResume = async () => {
    if (!order?.checkoutUrl) {
      setPanelError('This order cannot be resumed. Open your orders to check its status.');
      return;
    }
    setBusy('resume');
    setPanelError(null);
    try {
      await WebBrowser.openBrowserAsync(order.checkoutUrl, { showTitle: false });
    } catch (error) {
      setPanelError(errorMessage(error));
    } finally {
      setBusy(null);
    }
  };

  const handleCancelOrder = async () => {
    if (!orderId) return;
    setBusy('cancel');
    setPanelError(null);
    try {
      await cancelOrder.mutateAsync(orderId);
      // Seats are free again — the mutation invalidated the seat map, so any
      // account can select them immediately on the screen behind this one.
      router.back();
    } catch (error) {
      setPanelError(errorMessage(error));
    } finally {
      setBusy(null);
    }
  };

  if (holdQuery.isLoading || matchQuery.isLoading || (zone && seatMapQuery.isLoading)) {
    return (
      <Screen>
        <View style={styles.loading}>
          <Skeleton height={64} radius={16} />
          <Skeleton height={128} radius={18} />
          <Skeleton height={180} radius={18} />
          <Skeleton height={128} radius={18} />
        </View>
      </Screen>
    );
  }

  if (!holdId) {
    return (
      <Screen>
        <View style={styles.loading}>
          <EmptyState
            title="No seats held"
            description="Pick your seats again to start a new checkout."
          />
          <PrimaryButton label="Back to fixtures" onPress={() => router.replace('/(tabs)')} />
        </View>
      </Screen>
    );
  }

  if (!hold && !orderId) {
    return (
      <Screen>
        <View style={styles.loading}>
          <EmptyState
            title={holdQuery.isError ? 'Could not load your hold' : 'Hold expired'}
            description={
              holdQuery.isError && holdQuery.error instanceof Error
                ? holdQuery.error.message
                : 'Your seat hold has ended. Choose your seats again to continue.'
            }
          />
          <PrimaryButton
            label="Choose seats"
            onPress={() =>
              match?.id
                ? router.replace({ pathname: '/match/[id]', params: { id: match.id } })
                : router.replace('/(tabs)')
            }
          />
        </View>
      </Screen>
    );
  }

  if (!match) {
    return (
      <Screen>
        <View style={styles.loading}>
          <EmptyState
            title="Fixture unavailable"
            description={
              matchQuery.error instanceof Error
                ? matchQuery.error.message
                : 'This match could not be found.'
            }
          />
        </View>
      </Screen>
    );
  }

  const minutes = String(Math.floor(secondsLeft / 60)).padStart(2, '0');
  const seconds = String(secondsLeft % 60).padStart(2, '0');

  return (
    <Screen>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.iconButton}>
          <X size={20} color={colors.text} />
        </Pressable>
        <View style={styles.headerCenter}>
          <AppText variant="h3">Checkout</AppText>
          <AppText variant="caption" color={colors.muted} style={styles.headerSub}>
            STEP 2 OF 3 · PAYMENT
          </AppText>
        </View>
        <View style={styles.timer}>
          <Timer size={13} color={holdExpired ? colors.danger : colors.warning} />
          <AppText
            variant="label"
            color={holdExpired ? colors.danger : colors.warning}
            style={styles.timerText}>
            {holdExpired ? 'EXPIRED' : `${minutes}:${seconds}`}
          </AppText>
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        <Card style={styles.summary}>
          <View style={styles.summaryTop}>
            <View style={styles.crest}>
              <AppText variant="h3" color="#FFFFFF">
                KO
              </AppText>
            </View>
            <View style={styles.flex}>
              <AppText variant="label">KickOff vs {match.opponent}</AppText>
              <AppText variant="small" color={colors.muted} style={styles.matchMeta}>
                {formatMatchDate(match.kickoffAt)} · {formatMatchTime(match.kickoffAt)} ·{' '}
                {match.venue}
              </AppText>
            </View>
            <Pill
              label={`${seats.length} ${seats.length === 1 ? 'SEAT' : 'SEATS'}`}
              tone="green"
            />
          </View>

          <View style={styles.dashed} />

          <View style={styles.summaryRow}>
            <View>
              <AppText variant="caption" color={colors.muted} style={styles.rowLabel}>
                STAND
              </AppText>
              <AppText variant="label">{standName}</AppText>
            </View>
            <View>
              <AppText variant="caption" color={colors.muted} style={styles.rowLabel}>
                SEATS
              </AppText>
              <AppText variant="label">{seatLabels}</AppText>
            </View>
            <View style={styles.alignRight}>
              <AppText variant="caption" color={colors.muted} style={styles.rowLabel}>
                ROWS
              </AppText>
              <AppText variant="label">{rowLabels}</AppText>
            </View>
          </View>
        </Card>

        {orderPending ? (
          <Card style={styles.panel}>
            <View style={styles.panelTop}>
              <ShieldCheck size={15} color={colors.primary} />
              <AppText variant="label">Payment pending</AppText>
              <View style={styles.flex} />
              <AppText variant="label" color={colors.warning}>
                Reserved until {reservedClock}
              </AppText>
            </View>
            <AppText variant="small" color={colors.muted} style={styles.panelText}>
              Your seats are reserved for you while you finish paying on Stripe. Resume when you
              are ready, or cancel to free them for other fans.
            </AppText>
            <View style={styles.panelActions}>
              <PrimaryButton
                label={busy === 'resume' ? 'Opening…' : 'Resume payment'}
                onPress={() => void handleResume()}
                loading={busy === 'resume'}
                disabled={busy === 'cancel'}
                icon={<Lock size={15} color="#FFFFFF" />}
                style={styles.panelResume}
              />
              <Pressable
                onPress={() => void handleCancelOrder()}
                disabled={busy !== null}
                style={({ pressed }) => [
                  styles.panelCancel,
                  pressed && { opacity: 0.7 },
                  busy !== null && { opacity: 0.55 },
                ]}>
                <AppText variant="label" color={colors.warning}>
                  {busy === 'cancel' ? 'Cancelling…' : 'Cancel order'}
                </AppText>
              </Pressable>
            </View>
            {panelError ? (
              <AppText variant="small" color={colors.danger} style={styles.panelError}>
                {panelError}
              </AppText>
            ) : null}
          </Card>
        ) : null}

        <AppText variant="caption" color={colors.muted} style={styles.sectionLabel}>
          ATTENDEE
        </AppText>
        <Card style={styles.attendee}>
          <View style={styles.avatar}>
            <AppText variant="label" color="#FFFFFF">
              {profileQuery.data?.initials ?? 'KO'}
            </AppText>
          </View>
          <View style={styles.flex}>
            <AppText variant="label">{profileQuery.data?.fullName ?? 'KickOff supporter'}</AppText>
            <AppText variant="small" color={colors.muted}>
              {profileQuery.data?.email ?? 'Signed in'}
            </AppText>
          </View>
          <Pill label="TICKET HOLDER" tone="muted" />
        </Card>

        <View style={styles.sectionHead}>
          <AppText variant="caption" color={colors.muted} style={styles.sectionLabel}>
            PAYMENT METHOD
          </AppText>
          <View style={styles.stripePill}>
            <Lock size={10} color={colors.primary} />
            <AppText variant="caption" color={colors.primary} style={styles.stripeText}>
              STRIPE TEST MODE
            </AppText>
          </View>
        </View>

        <Card style={styles.paymentCard}>
          <View style={styles.cardBrandRow}>
            <View style={styles.visa}>
              <AppText variant="caption" color="#FFFFFF" style={styles.visaText}>
                STRIPE
              </AppText>
            </View>
            <View style={styles.flex}>
              <AppText variant="label">Secure hosted checkout</AppText>
              <AppText variant="small" color={colors.muted}>
                Card details are entered on Stripe, never in the app.
              </AppText>
            </View>
            <View style={styles.checkCircle}>
              <ShieldCheck size={13} color="#FFFFFF" />
            </View>
          </View>

          <View style={styles.brandRow}>
            <Lock size={14} color={colors.muted} />
            <AppText variant="caption" color={colors.muted} style={styles.brandText}>
              YOU WILL BE REDIRECTED TO STRIPE. USE A TEST CARD SUCH AS 4242 4242 4242 4242.
            </AppText>
          </View>
        </Card>

        <AppText variant="caption" color={colors.muted} style={styles.sectionLabel}>
          ORDER SUMMARY
        </AppText>
        <Card style={styles.receipt}>
          <Line
            label={`${seats.length} × ${zone?.name ?? 'Match ticket'}`}
            value={formatTHB(total)}
          />
          <Line label="Booking fee" value={formatTHB(0)} muted />
          <Line label="Payment processing" value={formatTHB(0)} muted />
          <View style={styles.dashed} />
          <View style={styles.totalRow}>
            <View>
              <AppText variant="caption" color={colors.muted} style={styles.rowLabel}>
                TOTAL INCLUDING VAT
              </AppText>
              <AppText variant="h2">{formatTHB(total)}</AppText>
            </View>
            <View style={styles.secure}>
              <ShieldCheck size={15} color={colors.primary} />
              <AppText variant="caption" color={colors.primary} style={styles.secureText}>
                SECURE
              </AppText>
            </View>
          </View>
        </Card>

        <View style={styles.terms}>
          <Lock size={12} color={colors.muted} />
          <AppText variant="caption" color={colors.muted} style={styles.termsText}>
            BY PAYING YOU ACCEPT THE SINGLE-MATCH TICKET TERMS. TICKETS ARE NON-REFUNDABLE AND
            TRANSFERABLE ONLY THROUGH THE CLUB.
          </AppText>
        </View>

        {payError ? (
          <AppText variant="small" color={colors.danger} style={styles.error}>
            {payError}
          </AppText>
        ) : null}

        {order && order.status !== 'pending' && order.status !== 'paid' ? (
          <AppText variant="small" color={colors.muted} style={styles.error}>
            Payment was not completed. Open your orders to check the status and try again.
          </AppText>
        ) : null}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 16) }]}>
        <View>
          <AppText variant="caption" color={colors.muted} style={styles.footerLabel}>
            TOTAL
          </AppText>
          <AppText variant="h2" style={styles.footerTotal}>
            {formatTHB(total)}
          </AppText>
        </View>
        {paymentStopped ? (
          <PrimaryButton
            label="View orders"
            onPress={() => router.replace('/orders')}
            style={styles.payButton}
          />
        ) : orderPending ? (
          <PrimaryButton
            label={busy === 'resume' ? 'Opening…' : 'Resume payment'}
            onPress={() => void handleResume()}
            loading={busy === 'resume'}
            disabled={busy === 'cancel'}
            icon={<Lock size={16} color="#FFFFFF" />}
            style={styles.payButton}
          />
        ) : (
          <PrimaryButton
            label={processing ? 'Confirming…' : `Pay ${formatTHB(total)}`}
            onPress={() => void handlePay()}
            loading={processing}
            disabled={holdExpired || seats.length === 0}
            icon={<Lock size={16} color="#FFFFFF" />}
            style={styles.payButton}
          />
        )}
      </View>
    </Screen>
  );
}

function Line({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <View style={styles.line}>
      <AppText variant="small" color={muted ? colors.muted : colors.text}>
        {label}
      </AppText>
      <AppText variant="label" color={muted ? colors.muted : colors.text}>
        {value}
      </AppText>
    </View>
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
  headerCenter: { flex: 1, alignItems: 'center', gap: 1 },
  headerSub: { fontSize: 8, letterSpacing: 0.7 },
  timer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.softGold,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 999,
  },
  timerText: { fontSize: 10 },
  scroll: { paddingHorizontal: 20, paddingBottom: 120 },
  loading: { padding: 20, gap: 16, flex: 1, justifyContent: 'center' },
  summary: { padding: 15 },
  summaryTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  crest: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  flex: { flex: 1 },
  matchMeta: { fontSize: 10, marginTop: 2 },
  dashed: {
    borderTopWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.line,
    marginVertical: 13,
  },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 10 },
  rowLabel: { fontSize: 8, letterSpacing: 0.8, marginBottom: 2 },
  alignRight: { alignItems: 'flex-end' },
  sectionLabel: { fontSize: 9, letterSpacing: 1, marginTop: 22, marginBottom: 9, marginLeft: 2 },
  attendee: { padding: 14, flexDirection: 'row', alignItems: 'center', gap: 11 },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  stripePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.softGreen,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    marginTop: 13,
  },
  stripeText: { fontSize: 7, letterSpacing: 0.7 },
  paymentCard: { padding: 15 },
  cardBrandRow: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  visa: {
    width: 44,
    height: 30,
    borderRadius: 6,
    backgroundColor: '#635BFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  visaText: { fontSize: 8, letterSpacing: 0.6 },
  checkCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 13 },
  brandText: { fontSize: 7, letterSpacing: 0.5, flex: 1 },
  receipt: { padding: 15, gap: 10 },
  line: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  totalRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  secure: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.softGreen,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 999,
  },
  secureText: { fontSize: 7, letterSpacing: 0.7 },
  terms: { flexDirection: 'row', gap: 7, marginTop: 16, paddingHorizontal: 4 },
  termsText: { flex: 1, fontSize: 7, lineHeight: 11, letterSpacing: 0.3 },
  error: { marginTop: 14, paddingHorizontal: 4 },
  panel: { marginTop: 14, padding: 15, borderColor: colors.accentSoft, borderWidth: 1 },
  panelTop: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  panelText: { marginTop: 8, lineHeight: 16 },
  panelActions: { flexDirection: 'row', gap: 10, marginTop: 14 },
  panelResume: { flex: 1 },
  panelCancel: {
    flex: 1,
    minHeight: 44,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.warning,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.softGold,
  },
  panelError: { marginTop: 10, lineHeight: 16 },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: colors.line,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 22,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  footerLabel: { fontSize: 8, letterSpacing: 0.8 },
  footerTotal: { fontSize: 26, lineHeight: 29 },
  payButton: { flex: 1 },
});
