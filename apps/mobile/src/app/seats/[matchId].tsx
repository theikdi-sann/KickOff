import { ChevronLeft, ShieldCheck } from 'lucide-react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  buildSeatMap,
  formatMatchDate,
  formatMatchTime,
  formatTHB,
  mockMatches,
  mockZones,
  type Seat,
  type Zone,
} from '@xclub/shared';
import { AppText, Pill, PrimaryButton, Screen } from '@/components/ui';
import { useMockCommerce } from '@/lib/mock-commerce';
import { colors, radii, shadow } from '@/lib/theme';

const MAX_SEATS = 6;

export default function SeatSelectionScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { matchId, zoneId: initialZoneId } = useLocalSearchParams<{ matchId: string; zoneId?: string }>();
  const { takenSeatIds } = useMockCommerce();
  const match = mockMatches.find((item) => item.id === matchId) ?? mockMatches[0];
  const zones = useMemo(() => mockZones.filter((zone) => zone.matchId === match.id), [match.id]);
  const [zoneId, setZoneId] = useState(
    initialZoneId && zones.some((zone) => zone.id === initialZoneId) ? initialZoneId : zones[0]?.id ?? '',
  );
  const [selected, setSelected] = useState<string[]>([]);
  const zone = zones.find((item) => item.id === zoneId) ?? zones[0];
  const seats = useMemo(() => (zone ? buildSeatMap(zone) : []), [zone]);
  const taken = useMemo(() => new Set(takenSeatIds(match.id)), [takenSeatIds, match.id]);
  const rows = zone?.rows ?? [];
  const selectedSeats = seats.filter((seat) => selected.includes(seat.id));
  const total = (zone?.priceSatang ?? 0) * selected.length;
  const soldCount = seats.filter((seat) => seat.status !== 'available' || taken.has(seat.id)).length;

  const chooseZone = (next: Zone) => {
    setZoneId(next.id);
    setSelected([]);
  };

  const toggleSeat = (seat: Seat) => {
    if (seat.status !== 'available' || taken.has(seat.id)) return;
    setSelected((current) => {
      if (current.includes(seat.id)) return current.filter((id) => id !== seat.id);
      if (current.length >= MAX_SEATS) return current;
      return [...current, seat.id];
    });
  };

  const continueToCheckout = () => {
    if (!zone || selected.length === 0) return;
    router.push({
      pathname: '/checkout',
      params: {
        matchId: match.id,
        zoneId: zone.id,
        seats: selectedSeats.map((seat) => seat.label).join(','),
      },
    });
  };

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
                XCLUB VS {match.opponent.toUpperCase()}
              </AppText>
            </View>
            <Pill label="MOCK" tone="gold" />
          </View>

          <View style={styles.matchStrip}>
            <View style={styles.stripItem}>
              <AppText variant="caption" color={colors.muted} style={styles.stripLabel}>
                FIXTURE
              </AppText>
              <AppText variant="label">XClub vs {match.opponent}</AppText>
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
                  {seats.length - soldCount}
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
                        const isSold = seat.status !== 'available' || taken.has(seat.id);
                        const isSelected = selected.includes(seat.id);
                        return (
                          <Pressable
                            key={seat.id}
                            onPress={() => toggleSeat(seat)}
                            disabled={isSold}
                            accessibilityRole="button"
                            accessibilityLabel={`Seat ${seat.label}${isSold ? ' unavailable' : isSelected ? ' selected' : ''}`}
                            accessibilityState={{ disabled: isSold, selected: isSelected }}
                            style={[
                              styles.seat,
                              isSold && styles.seatSold,
                              isSelected && styles.seatSelected,
                            ]}>
                            <AppText
                              variant="caption"
                              color={isSelected ? '#FFFFFF' : isSold ? '#A8B3AD' : colors.muted}
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
              <Legend color="#DDE3DF" label="Unavailable" />
            </View>
          </View>

          <View style={styles.note}>
            <ShieldCheck size={15} color={colors.primary} />
            <AppText variant="small" color={colors.muted} style={styles.noteText}>
              You can select up to {MAX_SEATS} seats per order. Seats are held for 10 minutes while
              you check out.
            </AppText>
          </View>
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
            onPress={continueToCheckout}
            disabled={selected.length === 0}
            style={styles.barButton}
          />
        </View>
      </View>
    </Screen>
  );
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
