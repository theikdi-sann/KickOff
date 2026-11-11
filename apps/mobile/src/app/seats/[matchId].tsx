import { ChevronLeft, ShieldCheck } from 'lucide-react-native';
import * as WebBrowser from 'expo-web-browser';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, type AlertButton, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  formatMatchDate,
  formatMatchTime,
  formatTHB,
  MAX_SEATS_PER_ORDER,
  type SeatDto,
  type ZoneDto,
} from '@kickoff/shared';
import { AppText, EmptyState, Pill, PrimaryButton, Screen, Skeleton } from '@/components/ui';
import { errorMessage } from '@/lib/api';
import { useCreateHold, useMyActiveHolds, useReleaseHold } from '@/lib/queries/holds';
import { useMatch } from '@/lib/queries/matches';
import { useCancelOrder, usePendingOrderSeats } from '@/lib/queries/orders';
import { useSeatMap, useZones } from '@/lib/queries/seats';
import { colors, radii, shadow } from '@/lib/theme';

export default function SeatSelectionScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { matchId, zoneId: initialZoneId } = useLocalSearchParams<{ matchId: string; zoneId?: string }>();
  const matchQuery = useMatch(matchId);
  const zonesQuery = useZones(matchId);
  const createHold = useCreateHold();

  const [zoneId, setZoneId] = useState(initialZoneId ?? '');
  const [selected, setSelected] = useState<string[]>([]);
  const [holdError, setHoldError] = useState<string | null>(null);

  const match = matchQuery.data;
  const zones = zonesQuery.data ?? [];
  const zone: ZoneDto | undefined = zones.find((item) => item.id === zoneId) ?? zones[0];
  const seatsQuery = useSeatMap(zone?.id);
  const seats = useMemo(() => seatsQuery.data ?? [], [seatsQuery.data]);
  const rows = zone?.rows ?? [];
  const selectedSeats = seats.filter((seat) => selected.includes(seat.id));
  const total = (zone?.priceSatang ?? 0) * selected.length;

  // Truth about "my" seats: own raw holds (pre-payment) and own pending orders.
  const myHoldsQuery = useMyActiveHolds();
  const pendingSeatsQuery = usePendingOrderSeats(matchId);
  const releaseHold = useReleaseHold();
  const cancelOrder = useCancelOrder();
  const holdsBySeat = useMemo(
    () => new Map((myHoldsQuery.data ?? []).map((hold) => [hold.seatId, hold])),
    [myHoldsQuery.data],
  );
  const pendingBySeat = useMemo(
    () => new Map((pendingSeatsQuery.data ?? []).map((seat) => [seat.seatId, seat])),
    [pendingSeatsQuery.data],
  );
  const freeCount = seats.filter(
    (seat) => seat.status === 'available' && !holdsBySeat.has(seat.id),
  ).length;
  const zoneHoldCount = seats.filter((seat) => holdsBySeat.has(seat.id)).length;
  const pendingCount = seats.filter((seat) => pendingBySeat.has(seat.id)).length;
  const pendingExpiryMs = seats.reduce((max, seat) => {
    const info = pendingBySeat.get(seat.id);
    return Math.max(max, info?.expiresAt ? Date.parse(info.expiresAt) : 0);
  }, 0);
  const reservedNotice = pendingCount
    ? `${pendingCount} ${pendingCount === 1 ? 'seat is' : 'seats are'} reserved for you${
        pendingExpiryMs
          ? ` until ${formatMatchTime(new Date(pendingExpiryMs).toISOString())}`
          : ''
      } — tap a gold seat to resume payment or cancel.`
    : zoneHoldCount
      ? `${zoneHoldCount} ${zoneHoldCount === 1 ? 'seat is' : 'seats are'} held by you — tap a gold seat to resume checkout or release ${zoneHoldCount === 1 ? 'it' : 'them'}.`
      : null;

  const chooseZone = (next: ZoneDto) => {
    setZoneId(next.id);
    setSelected([]);
    setHoldError(null);
  };

  const showHoldAlert = (seat: SeatDto, hold: { holdGroupId: string; expiresAt: string }) => {
    const buttons: AlertButton[] = [
      {
        text: 'Resume checkout',
        onPress: () =>
          router.push({
            pathname: '/checkout',
            params: { holdId: hold.holdGroupId, matchId, zoneId: seat.zoneId },
          }),
      },
      {
        text: 'Release seat',
        style: 'destructive',
        onPress: () =>
          void releaseHold.mutateAsync(hold.holdGroupId).catch((error) =>
            Alert.alert('Could not release the seat', errorMessage(error)),
          ),
      },
      { text: 'Close', style: 'cancel' },
    ];
    Alert.alert(
      `Seat ${seat.label} is held by you`,
      `Your hold runs until ${formatMatchTime(hold.expiresAt)}.`,
      buttons,
    );
  };

  const showOrderAlert = (
    seat: SeatDto,
    order: { orderId: string; expiresAt: string | null; checkoutUrl: string | null },
  ) => {
    const buttons: AlertButton[] = [];
    if (order.checkoutUrl) {
      buttons.push({
        text: 'Resume payment',
        onPress: () => void WebBrowser.openBrowserAsync(order.checkoutUrl!),
      });
    }
    buttons.push(
      {
        text: 'Cancel order',
        style: 'destructive',
        onPress: () =>
          void cancelOrder
            .mutateAsync(order.orderId)
            .catch((error) => Alert.alert('Could not cancel the order', errorMessage(error))),
      },
      { text: 'Close', style: 'cancel' },
    );
    Alert.alert(
      `Seat ${seat.label} is reserved for you`,
      order.expiresAt
        ? `Reserved until ${formatMatchTime(order.expiresAt)} while you finish payment.`
        : 'Your pending order still holds this seat.',
      buttons,
    );
  };

  const toggleSeat = (seat: SeatDto) => {
    const mineHold = holdsBySeat.get(seat.id);
    if (mineHold) {
      showHoldAlert(seat, mineHold);
      return;
    }
    const mineOrder = pendingBySeat.get(seat.id);
    if (mineOrder) {
      showOrderAlert(seat, mineOrder);
      return;
    }
    if (seat.status !== 'available') return;
    setHoldError(null);
    setSelected((current) => {
      if (current.includes(seat.id)) return current.filter((id) => id !== seat.id);
      if (current.length >= MAX_SEATS_PER_ORDER) return current;
      return [...current, seat.id];
    });
  };

  const continueToCheckout = async () => {
    if (!match || !zone || selected.length === 0) return;
    setHoldError(null);
    try {
      const hold = await createHold.mutateAsync({ matchId: match.id, seatIds: selected });
      router.push({
        pathname: '/checkout',
        params: {
          holdId: hold.id,
          matchId: match.id,
          zoneId: zone.id,
          seats: selectedSeats.map((seat) => seat.label).join(','),
        },
      });
    } catch (error) {
      setHoldError(readableHoldError(error));
      void seatsQuery.refetch();
      setSelected([]);
    }
  };

  if (matchQuery.isLoading) {
    return (
      <Screen>
        <View style={{ padding: 20, gap: 14 }}>
          <Skeleton height={52} radius={16} />
          <Skeleton height={86} radius={16} />
          <Skeleton height={420} radius={22} />
        </View>
      </Screen>
    );
  }

  if (!match) {
    return (
      <Screen>
        <View style={{ padding: 20 }}>
          <EmptyState
            title="Fixture unavailable"
            description={
              matchQuery.error instanceof Error ? matchQuery.error.message : 'This match could not be found.'
            }
          />
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <View style={styles.flex}>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
          <View style={styles.header}>
            <Pressable onPress={() => router.back()} style={styles.back}>
              <ChevronLeft size={22} color={colors.text} />
            </Pressable>
            <View style={styles.headerCenter}>
              <AppText variant="h3">Choose your seat</AppText>
              <AppText variant="caption" color={colors.muted} style={styles.headerSub}>
                KICKOFF VS {match.opponent.toUpperCase()}
              </AppText>
            </View>
            <Pill label="LIVE" tone="green" />
          </View>

          <View style={styles.matchStrip}>
            <View style={styles.stripItem}>
              <AppText variant="caption" color={colors.muted} style={styles.stripLabel}>
                FIXTURE
              </AppText>
              <AppText variant="label">KickOff vs {match.opponent}</AppText>
            </View>
            <View style={styles.stripDivider} />
            <View style={styles.stripItem}>
              <AppText variant="caption" color={colors.muted} style={styles.stripLabel}>
                KICK-OFF
              </AppText>
              <AppText variant="label">
                {formatMatchDate(match.kickoffAt)} · {formatMatchTime(match.kickoffAt)}
              </AppText>
            </View>
          </View>

          {reservedNotice ? (
            <View style={styles.notice}>
              <ShieldCheck size={15} color={colors.accentDeep} />
              <AppText variant="small" color={colors.accentDeep} style={styles.noticeText}>
                {reservedNotice}
              </AppText>
            </View>
          ) : null}

          <AppText variant="caption" color={colors.muted} style={styles.sectionLabel}>
            SELECT STAND
          </AppText>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.zoneRow}>
            {zones.map((item) => (
              <Pressable
                key={item.id}
                onPress={() => chooseZone(item)}
                style={[styles.zoneChip, item.id === zone?.id && styles.zoneChipActive]}>
                <View style={[styles.zoneDot, { backgroundColor: item.color }]} />
                <View>
                  <AppText
                    variant="label"
                    color={item.id === zone?.id ? '#FFFFFF' : colors.text}
                    style={styles.zoneChipLabel}>
                    {item.name}
                  </AppText>
                  <AppText
                    variant="caption"
                    color={item.id === zone?.id ? 'rgba(255,255,255,0.7)' : colors.muted}
                    style={styles.zoneChipPrice}>
                    {formatTHB(item.priceSatang)}
                  </AppText>
                </View>
              </Pressable>
            ))}
          </ScrollView>

          <View style={styles.mapCard}>
            <View style={styles.mapHeader}>
              <View>
                <AppText variant="h3">{zone?.name}</AppText>
                <AppText variant="small" color={colors.muted} style={styles.mapSub}>
                  {zone?.description}
                </AppText>
              </View>
              <View style={styles.availBox}>
                <AppText variant="h3" color={colors.primary}>
                  {freeCount}
                </AppText>
                <AppText variant="caption" color={colors.muted} style={styles.availLabel}>
                  FREE
                </AppText>
              </View>
            </View>

            <View style={styles.pitchTag}>
              <View style={styles.pitchTagLine} />
              <AppText variant="caption" color={colors.muted} style={styles.pitchTagText}>
                PITCH THIS WAY
              </AppText>
              <View style={styles.pitchTagLine} />
            </View>

            <View style={styles.seatGrid}>
              {rows.map((row) => (
                <View key={row} style={styles.seatRow}>
                  <AppText variant="caption" color={colors.muted} style={styles.rowLabel}>
                    {row}
                  </AppText>
                  <View style={styles.seats}>
                    {seats
                      .filter((seat) => seat.row === row)
                      .map((seat) => {
                        const isMine = holdsBySeat.has(seat.id) || pendingBySeat.has(seat.id);
                        const isTaken = !isMine && seat.status !== 'available';
                        const isSelected = selected.includes(seat.id);
                        const stateLabel = isMine
                          ? ' reserved by you'
                          : isSelected
                            ? ' selected'
                            : seat.status === 'sold'
                              ? ' sold'
                              : isTaken
                                ? ' reserved by another buyer'
                                : '';
                        return (
                          <Pressable
                            key={seat.id}
                            onPress={() => toggleSeat(seat)}
                            disabled={isTaken}
                            accessibilityRole="button"
                            accessibilityLabel={`Seat ${seat.label}${stateLabel}`}
                            accessibilityState={{ disabled: isTaken, selected: isSelected }}
                            style={[
                              styles.seat,
                              isTaken && styles.seatSold,
                              isMine && styles.seatMine,
                              isSelected && styles.seatSelected,
                            ]}>
                            <AppText
                              variant="caption"
                              color={
                                isSelected
                                  ? '#FFFFFF'
                                  : isTaken
                                    ? '#A8B3AD'
                                    : isMine
                                      ? colors.accentDeep
                                      : colors.muted
                              }
                              style={styles.seatText}>
                              {seat.number}
                            </AppText>
                          </Pressable>
                        );
                      })}
                  </View>
                </View>
              ))}
            </View>

            <View style={styles.legend}>
              <Legend color="#FFFFFF" border={colors.line} label="Available" />
              <Legend color={colors.primary} label="Selected" />
              <Legend color={colors.accent} border={colors.accentSoft} label="Reserved by you" />
              <Legend color="#DDE3DF" label="Unavailable" />
            </View>
          </View>

          <View style={styles.note}>
            <ShieldCheck size={15} color={colors.primary} />
            <AppText variant="small" color={colors.muted} style={styles.noteText}>
              You can select up to {MAX_SEATS_PER_ORDER} seats per order. Seats are held for 10
              minutes while you check out.
            </AppText>
          </View>
          {holdError ? (
            <View style={styles.note}>
              <AppText variant="small" color={colors.danger} style={styles.noteText}>
                {holdError}
              </AppText>
            </View>
          ) : null}
        </ScrollView>

        <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 12) }]}>
          <View style={styles.barLeft}>
            <AppText variant="caption" color={colors.muted} style={styles.barLabel}>
              {selected.length} {selected.length === 1 ? 'SEAT' : 'SEATS'} SELECTED
            </AppText>
            <AppText variant="h3" style={styles.barTotal}>
              {formatTHB(total)}
            </AppText>
          </View>
          <PrimaryButton
            label={selected.length ? 'Continue' : 'Select a seat'}
            onPress={() => void continueToCheckout()}
            disabled={selected.length === 0}
            loading={createHold.isPending}
            style={styles.barButton}
          />
        </View>
      </View>
    </Screen>
  );
}

/** Explain a server seat-conflict refusal in terms the buyer can act on. */
function readableHoldError(error: unknown): string {
  const message = errorMessage(error);
  if (/already held|unavailable|no longer available/i.test(message)) {
    return 'That seat was just taken by someone else. The map has refreshed — please pick another seat.';
  }
  if (/expired/i.test(message)) {
    return 'Your seat hold expired. Select your seats again to continue.';
  }
  return message;
}

function Legend({ color, border, label }: { color: string; border?: string; label: string }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendDot, { backgroundColor: color, borderColor: border ?? color, borderWidth: border ? 1 : 0 }]} />
      <AppText variant="caption" color={colors.muted} style={styles.legendText}>
        {label}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scroll: { paddingBottom: 120 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 10,
    gap: 10,
  },
  back: {
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
  matchStrip: {
    flexDirection: 'row',
    marginHorizontal: 20,
    marginTop: 6,
    backgroundColor: '#FFFFFF',
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 12,
    gap: 12,
  },
  stripItem: { flex: 1, gap: 2 },
  stripLabel: { fontSize: 8, letterSpacing: 0.8 },
  stripDivider: { width: 1, backgroundColor: colors.line },
  sectionLabel: { fontSize: 9, letterSpacing: 1, marginTop: 22, marginLeft: 22 },
  zoneRow: { paddingHorizontal: 20, paddingTop: 9, paddingBottom: 4, gap: 8 },
  zoneChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radii.md,
    paddingHorizontal: 13,
    paddingVertical: 10,
  },
  zoneChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  zoneDot: { width: 8, height: 8, borderRadius: 4 },
  zoneChipLabel: { fontSize: 11 },
  zoneChipPrice: { fontSize: 9, marginTop: 1 },
  mapCard: {
    marginHorizontal: 20,
    marginTop: 16,
    backgroundColor: '#FFFFFF',
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 16,
    ...shadow,
  },
  mapHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  mapSub: { fontSize: 11, marginTop: 2 },
  availBox: { alignItems: 'center', backgroundColor: colors.softGreen, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 7 },
  availLabel: { fontSize: 7, letterSpacing: 0.7 },
  pitchTag: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 16 },
  pitchTagLine: { flex: 1, height: 1, backgroundColor: colors.line },
  pitchTagText: { fontSize: 7, letterSpacing: 1 },
  seatGrid: { marginTop: 14, gap: 6 },
  seatRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rowLabel: { width: 14, fontSize: 9, textAlign: 'center' },
  seats: { flex: 1, flexDirection: 'row', gap: 3 },
  seat: {
    flex: 1,
    maxWidth: 28,
    aspectRatio: 1,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  seatSold: { backgroundColor: '#DDE3DF', borderColor: '#DDE3DF' },
  seatMine: { backgroundColor: colors.softGold, borderColor: colors.accent },
  seatSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  seatText: { fontSize: 8, letterSpacing: 0 },
  legend: { flexDirection: 'row', gap: 16, marginTop: 18, justifyContent: 'center' },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot: { width: 10, height: 10, borderRadius: 3 },
  legendText: { fontSize: 8, letterSpacing: 0.3 },
  note: {
    flexDirection: 'row',
    gap: 8,
    marginHorizontal: 20,
    marginTop: 16,
    padding: 13,
    backgroundColor: colors.softGreen,
    borderRadius: radii.md,
  },
  noteText: { flex: 1, fontSize: 10, lineHeight: 15 },
  notice: {
    flexDirection: 'row',
    gap: 8,
    marginHorizontal: 20,
    marginTop: 12,
    padding: 13,
    backgroundColor: colors.softGold,
    borderColor: colors.accentSoft,
    borderWidth: 1,
    borderRadius: radii.md,
  },
  noticeText: { flex: 1, fontSize: 10, lineHeight: 15 },
  bar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: colors.line,
    paddingHorizontal: 20,
    paddingTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    ...shadow,
  },
  barLeft: { flex: 1, gap: 2 },
  barLabel: { fontSize: 8, letterSpacing: 0.7 },
  barTotal: { fontSize: 23, lineHeight: 26 },
  barButton: { minWidth: 165 },
});
