import { Check, CreditCard, Lock, ShieldCheck, Timer, X } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  buildSeatMap,
  formatMatchDate,
  formatMatchTime,
  formatTHB,
  mockMatches,
  mockZones,
} from '@xclub/shared';

import { AppText, Card, Pill, PrimaryButton, Screen } from '@/components/ui';
import { useApp } from '@/lib/store';
import { colors, radii } from '@/lib/theme';

export default function CheckoutScreen() {
  const router = useRouter();
  const { matchId, zoneId, seats: seatParam } = useLocalSearchParams<{
    matchId: string;
    zoneId: string;
    seats: string;
  }>();
  const { profile, purchase } = useApp();
  const insets = useSafeAreaInsets();
  const [processing, setProcessing] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(600);
  const match = mockMatches.find((item) => item.id === matchId) ?? mockMatches[0];
  const zone = mockZones.find((item) => item.id === zoneId);
  const labels = useMemo(() => (seatParam ?? '').split(',').filter(Boolean), [seatParam]);
  const seats = useMemo(() => {
    if (!zone) return [];
    return buildSeatMap(zone).filter((seat) => labels.includes(seat.label));
  }, [zone, labels]);
  const total = (zone?.priceSatang ?? 0) * seats.length;

  useEffect(() => {
    const timer = setInterval(() => setSecondsLeft((value) => Math.max(0, value - 1)), 1000);
    return () => clearInterval(timer);
  }, []);

  const handlePay = async () => {
    if (!zone || seats.length === 0) {
      Alert.alert('Selection expired', 'Please go back and choose your seats again.');
      return;
    }
    setProcessing(true);
    await new Promise((resolve) => setTimeout(resolve, 1700));
    try {
      const result = await purchase({
        match,
        zone,
        seats,
        holder: profile?.fullName ?? 'XClub Supporter',
      });
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
      setProcessing(false);
      router.replace({
        pathname: '/ticket/[id]',
        params: { id: result.tickets[0].id, new: '1', count: String(result.tickets.length) },
      });
    } catch {
      setProcessing(false);
      Alert.alert('Mock payment failed', 'Please try again.');
    }
  };

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
          <Timer size={13} color={colors.warning} />
          <AppText variant="label" color={colors.warning} style={styles.timerText}>
            {minutes}:{seconds}
          </AppText>
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        <Card style={styles.summary}>
          <View style={styles.summaryTop}>
            <View style={styles.crest}>
              <AppText variant="h3" color="#FFFFFF">
                XC
              </AppText>
            </View>
            <View style={styles.flex}>
              <AppText variant="label">XClub vs {match.opponent}</AppText>
              <AppText variant="small" color={colors.muted} style={styles.matchMeta}>
                {formatMatchDate(match.kickoffAt)} · {formatMatchTime(match.kickoffAt)} · {match.venue}
              </AppText>
            </View>
            <Pill label={`${seats.length} ${seats.length === 1 ? 'SEAT' : 'SEATS'}`} tone="green" />
          </View>

          <View style={styles.dashed} />

          <View style={styles.summaryRow}>
            <View>
              <AppText variant="caption" color={colors.muted} style={styles.rowLabel}>
                STAND
              </AppText>
              <AppText variant="label">{zone?.name ?? '—'}</AppText>
            </View>
            <View>
              <AppText variant="caption" color={colors.muted} style={styles.rowLabel}>
                SEATS
              </AppText>
              <AppText variant="label">{seats.map((seat) => seat.label).join(', ')}</AppText>
            </View>
            <View style={styles.alignRight}>
              <AppText variant="caption" color={colors.muted} style={styles.rowLabel}>
                ROWS
              </AppText>
              <AppText variant="label">{[...new Set(seats.map((seat) => seat.row))].join(', ')}</AppText>
            </View>
          </View>
        </Card>

        <AppText variant="caption" color={colors.muted} style={styles.sectionLabel}>
          ATTENDEE
        </AppText>
        <Card style={styles.attendee}>
          <View style={styles.avatar}>
            <AppText variant="label" color="#FFFFFF">
              {profile?.initials ?? 'NC'}
            </AppText>
          </View>
          <View style={styles.flex}>
            <AppText variant="label">{profile?.fullName ?? 'Nara Chaiyaporn'}</AppText>
            <AppText variant="small" color={colors.muted}>
              {profile?.email ?? 'fan@xclub.app'}
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
                VISA
              </AppText>
            </View>
            <View style={styles.flex}>
              <AppText variant="label">Test card ending 4242</AppText>
              <AppText variant="small" color={colors.muted}>
                Mock saved card · no real charge
              </AppText>
            </View>
            <View style={styles.checkCircle}>
              <Check size={13} color="#FFFFFF" />
            </View>
          </View>

          <View style={styles.cardFields}>
            <View style={[styles.cardField, { flex: 1 }]}>
              <AppText variant="caption" color={colors.muted} style={styles.fieldLabel}>
                CARD NUMBER
              </AppText>
              <AppText variant="label" color={colors.muted}>
                •••• •••• •••• 4242
              </AppText>
            </View>
            <View style={styles.cardField}>
              <AppText variant="caption" color={colors.muted} style={styles.fieldLabel}>
                EXPIRY
              </AppText>
              <AppText variant="label" color={colors.muted}>
                12/29
              </AppText>
            </View>
            <View style={styles.cardField}>
              <AppText variant="caption" color={colors.muted} style={styles.fieldLabel}>
                CVC
              </AppText>
              <AppText variant="label" color={colors.muted}>
                •••
              </AppText>
            </View>
          </View>

          <View style={styles.brandRow}>
            <CreditCard size={14} color={colors.muted} />
            <AppText variant="caption" color={colors.muted} style={styles.brandText}>
              HOSTED CHECKOUT COMES IN PHASE C · THIS BUTTON SIMULATES SUCCESS
            </AppText>
          </View>
        </Card>

        <AppText variant="caption" color={colors.muted} style={styles.sectionLabel}>
          ORDER SUMMARY
        </AppText>
        <Card style={styles.receipt}>
          <Line label={`${seats.length} × ${zone?.name ?? 'Match ticket'}`} value={formatTHB(total)} />
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
        <PrimaryButton
          label={processing ? 'Processing…' : `Pay ${formatTHB(total)}`}
          onPress={handlePay}
          loading={processing}
          disabled={seats.length === 0}
          icon={<Lock size={16} color="#FFFFFF" />}
          style={styles.payButton}
        />
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
    backgroundColor: '#1A1F71',
    alignItems: 'center',
    justifyContent: 'center',
  },
  visaText: { fontSize: 9, letterSpacing: 1 },
  checkCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardFields: {
    flexDirection: 'row',
    gap: 10,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radii.md,
    padding: 12,
    marginTop: 13,
  },
  cardField: { gap: 3 },
  fieldLabel: { fontSize: 7, letterSpacing: 0.7 },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 11 },
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
