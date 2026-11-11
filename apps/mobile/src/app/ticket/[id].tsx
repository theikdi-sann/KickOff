import { LinearGradient } from 'expo-linear-gradient';
import {
  Check,
  ChevronLeft,
  Clock3,
  Download,
  MapPin,
  QrCode as QrIcon,
  Share2,
  ShieldCheck,
  Ticket as TicketIcon,
} from 'lucide-react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useKeepAwake } from 'expo-keep-awake';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  View,
} from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import { StatusBar } from 'expo-status-bar';
import { useRef, useState } from 'react';
import { formatFullDate, formatMatchTime, formatTHB } from '@kickoff/shared';
import { AppText, Pill, Screen, Skeleton } from '@/components/ui';
import { useTicket, useTicketQr } from '@/lib/queries/tickets';
import { colors, radii, shadow } from '@/lib/theme';

export default function TicketDetailScreen() {
  const router = useRouter();
  // The QR only needs to be readable; don't let the screen lock at the gate.
  useKeepAwake();
  const {
    id,
    new: isNew,
    count,
  } = useLocalSearchParams<{ id: string; new?: string; count?: string }>();
  const ticketQuery = useTicket(id);
  const qrQuery = useTicketQr(id);
  const ticket = ticketQuery.data;
  const qrPayload = qrQuery.data?.qrPayload ?? '';
  const used = ticket?.status === 'used';
  // The pass card itself is captured to a PNG for sharing.
  const passRef = useRef<LinearGradient>(null);
  const [sharing, setSharing] = useState(false);

  if (ticketQuery.isLoading) {
    return (
      <Screen dark>
        <StatusBar style="light" />
        <View style={styles.empty}>
          <Skeleton height={420} radius={28} width="100%" />
        </View>
      </Screen>
    );
  }

  if (!ticket) {
    return (
      <Screen dark>
        <View style={styles.empty}>
          <QrIcon size={36} color={colors.nightMuted} />
          <AppText variant="h2" color="#FFFFFF" style={styles.emptyTitle}>
            Pass not found
          </AppText>
          <AppText variant="small" color={colors.nightMuted} style={styles.emptyText}>
            {ticketQuery.error instanceof Error
              ? ticketQuery.error.message
              : 'This pass could not be loaded.'}
          </AppText>
          <Pressable onPress={() => router.replace('/tickets')} style={styles.emptyButton}>
            <AppText variant="label" color={colors.ink}>
              View my tickets
            </AppText>
          </Pressable>
        </View>
      </Screen>
    );
  }

  const passText = `KickOff match pass\n${ticket.matchLabel}\n${formatFullDate(ticket.kickoffAt)} · ${formatMatchTime(ticket.kickoffAt)}\n${ticket.zoneName} · Row ${ticket.row} · Seat ${ticket.number}\nHolder: ${ticket.holder}\n\nThe QR is signed and checked live at the gate.`;

  // Share the pass as an image: capture the rendered card to a PNG and hand
  // it to the OS share sheet. Falls back to plain text when capture or
  // sharing is unavailable (e.g. web), so sharing never dead-ends.
  const sharePass = async () => {
    if (sharing) return;
    setSharing(true);
    try {
      const uri = await captureRef(passRef, { format: 'png', quality: 1, result: 'tmpfile' });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, {
          mimeType: 'image/png',
          dialogTitle: 'KickOff match pass',
          UTI: 'public.png',
        });
      } else {
        await Share.share({ message: passText });
      }
    } catch {
      await Share.share({ message: passText }).catch(() => undefined);
    } finally {
      setSharing(false);
    }
  };

  return (
    <Screen dark>
      <StatusBar style="light" />
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.iconButton}>
          <ChevronLeft size={21} color="#FFFFFF" />
        </Pressable>
        <View style={styles.headerCenter}>
          <AppText variant="h3" color="#FFFFFF">
            Digital pass
          </AppText>
          <AppText variant="caption" color={colors.nightMuted} style={styles.headerSub}>
            OFFLINE READY
          </AppText>
        </View>
        <Pressable onPress={sharePass} style={styles.iconButton}>
          <Share2 size={18} color="#FFFFFF" />
        </Pressable>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        {isNew === '1' ? (
          <View style={styles.success}>
            <View style={styles.successIcon}>
              <Check size={15} color={colors.ink} />
            </View>
            <View style={styles.flex}>
              <AppText variant="label" color={colors.accent}>
                Payment successful
              </AppText>
              <AppText variant="small" color={colors.nightMuted} style={styles.successText}>
                {count && Number(count) > 1
                  ? `${count} passes are now in My Tickets. Showing the first one.`
                  : 'Your match pass is ready to scan at the gate.'}
              </AppText>
            </View>
          </View>
        ) : null}

        <LinearGradient
          ref={passRef}
          colors={used ? ['#263238', '#121A16'] : [colors.primaryBright, colors.primaryDark, colors.night]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.pass}>
          <View style={styles.passGlow} />
          <View style={styles.passTop}>
            <View style={styles.brandRow}>
              <View style={styles.logo}>
                <AppText variant="h3" color={colors.ink} style={styles.logoText}>
                  X
                </AppText>
              </View>
              <View>
                <AppText variant="h3" color="#FFFFFF" style={styles.brand}>
                  KICKOFF
                </AppText>
                <AppText variant="caption" color="rgba(255,255,255,0.55)" style={styles.brandSub}>
                  OFFICIAL MATCH PASS
                </AppText>
              </View>
            </View>
            <Pill label={used ? 'USED' : 'VALID'} tone={used ? 'muted' : 'gold'} />
          </View>

          <View style={styles.matchBlock}>
            <AppText variant="caption" color={colors.accent} style={styles.matchLabel}>
              {formatMatchTime(ticket.kickoffAt)} KICK-OFF · {ticket.venue.toUpperCase()}
            </AppText>
            <AppText variant="title" color="#FFFFFF" style={styles.matchTitle}>
              KickOff vs {ticket.opponent}
            </AppText>
            <AppText variant="small" color="rgba(255,255,255,0.65)">
              {formatFullDate(ticket.kickoffAt)}
            </AppText>
          </View>

          <View style={styles.teamsRow}>
            <TeamBadge short="KO" label="KICKOFF" colors={[colors.primaryBright, colors.primaryDark]} />
            <View style={styles.vs}>
              <AppText variant="caption" color="rgba(255,255,255,0.4)">
                VS
              </AppText>
            </View>
            <TeamBadge short={ticket.opponent.slice(0, 3).toUpperCase()} label={ticket.opponent.toUpperCase()} colors={[colors.accent, colors.accentDeep]} />
          </View>

          <View style={styles.perforation}>
            <View style={styles.notchLeft} />
            <View style={styles.dash} />
            <View style={styles.notchRight} />
          </View>

          <View style={styles.qrSection}>
            <Pressable
              onPress={() => void qrQuery.refetch()}
              style={styles.qrBox}
              accessibilityRole="button"
              accessibilityLabel="Refresh signed QR code">
              {qrPayload ? (
                <QRCode
                  value={qrPayload}
                  size={186}
                  color={colors.night}
                  backgroundColor="#FFFFFF"
                  quietZone={8}
                />
              ) : (
                <View style={styles.qrLoading}>
                  {qrQuery.error ? (
                    <AppText variant="small" color={colors.muted} style={styles.qrError}>
                      Tap to reload your QR
                    </AppText>
                  ) : (
                    <ActivityIndicator color={colors.primary} />
                  )}
                </View>
              )}
              {used ? (
                <View style={styles.usedOverlay}>
                  <AppText variant="display" color="#FFFFFF" style={styles.usedText}>
                    USED
                  </AppText>
                </View>
              ) : null}
            </Pressable>
            <View style={styles.scanRow}>
              <QrIcon size={14} color={colors.accent} />
              <AppText variant="caption" color={colors.accent} style={styles.scanText}>
                SCAN AT THE GATE · ONE ENTRY ONLY
              </AppText>
            </View>
            <AppText variant="caption" color="rgba(255,255,255,0.4)" style={styles.ticketId}>
              PASS ID · {ticket.id.toUpperCase()}
            </AppText>
          </View>

          <View style={styles.passStats}>
            <PassStat label="STAND" value={ticket.zoneName} />
            <PassStat label="ROW" value={ticket.row} />
            <PassStat label="SEAT" value={String(ticket.number).padStart(2, '0')} />
          </View>

          <View style={styles.holderRow}>
            <View>
              <AppText variant="caption" color="rgba(255,255,255,0.4)" style={styles.holderLabel}>
                TICKET HOLDER
              </AppText>
              <AppText variant="label" color="#FFFFFF">
                {ticket.holder}
              </AppText>
            </View>
            <View style={styles.holderRight}>
              <AppText variant="caption" color="rgba(255,255,255,0.4)" style={styles.holderLabel}>
                PAID
              </AppText>
              <AppText variant="label" color={colors.accent}>
                {formatTHB(ticket.priceSatang)}
              </AppText>
            </View>
          </View>
        </LinearGradient>

        <View style={styles.actions}>
          <Pressable
            onPress={() => void sharePass()}
            disabled={sharing}
            style={({ pressed }) => [styles.actionButton, pressed && { opacity: 0.7 }]}>
            {sharing ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <Share2 size={17} color="#FFFFFF" />
            )}
            <AppText variant="label" color="#FFFFFF">
              {sharing ? 'Preparing image…' : 'Share pass'}
            </AppText>
          </Pressable>
          <Pressable
            onPress={() => router.push('/orders')}
            style={({ pressed }) => [styles.actionButton, styles.actionGhost, pressed && { opacity: 0.7 }]}>
            <Download size={17} color="#FFFFFF" />
            <AppText variant="label" color="#FFFFFF">
              Receipt
            </AppText>
          </Pressable>
        </View>

        <View style={styles.infoCard}>
          <View style={styles.infoIcon}>
            <ShieldCheck size={18} color={colors.accent} />
          </View>
          <View style={styles.flex}>
            <AppText variant="label" color="#FFFFFF">
              Entry checklist
            </AppText>
            <AppText variant="small" color={colors.nightMuted} style={styles.infoText}>
              Arrive 60 minutes early. Have this pass open at full brightness. Photo ID may be
              requested. Each pass admits one entry, so sharing the QR does not create a second
              admission.
            </AppText>
          </View>
        </View>

        <View style={styles.metaGrid}>
          <MetaTile icon={<Clock3 size={15} color={colors.accent} />} label="GATES OPEN" value="2H BEFORE" />
          <MetaTile icon={<MapPin size={15} color={colors.accent} />} label="ENTRY" value="Any gate" />
          <MetaTile icon={<TicketIcon size={15} color={colors.accent} />} label="ORDER" value={ticket.orderId.slice(-6).toUpperCase()} />
        </View>

        <Pressable onPress={() => router.push('/orders')} style={styles.orderLink}>
          <AppText variant="small" color={colors.nightMuted}>
            Need the receipt or another pass?{' '}
            <AppText variant="label" color={colors.accent}>
              Open orders
            </AppText>
          </AppText>
        </Pressable>

        <AppText variant="caption" color={colors.mutedGreen} style={styles.footer}>
          SECURE PASS · SIGNED QR · VALID FOR ONE ENTRY
        </AppText>
      </ScrollView>
    </Screen>
  );
}

function TeamBadge({ short, label, colors: badgeColors }: { short: string; label: string; colors: [string, string] }) {
  return (
    <View style={styles.team}>
      <LinearGradient colors={badgeColors} style={styles.teamBadge}>
        <AppText variant="label" color="#FFFFFF" style={styles.teamShort}>
          {short}
        </AppText>
      </LinearGradient>
      <AppText variant="caption" color="rgba(255,255,255,0.65)" style={styles.teamLabel} numberOfLines={1}>
        {label}
      </AppText>
    </View>
  );
}

function PassStat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.passStat}>
      <AppText variant="caption" color="rgba(255,255,255,0.4)" style={styles.passStatLabel}>
        {label}
      </AppText>
      <AppText variant="h3" color="#FFFFFF" numberOfLines={1} style={styles.passStatValue}>
        {value}
      </AppText>
    </View>
  );
}

function MetaTile({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <View style={styles.metaTile}>
      {icon}
      <AppText variant="caption" color={colors.nightMuted} style={styles.metaLabel}>
        {label}
      </AppText>
      <AppText variant="label" color="#FFFFFF">
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
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCenter: { flex: 1, alignItems: 'center', gap: 1 },
  headerSub: { fontSize: 8, letterSpacing: 0.9 },
  scroll: { paddingHorizontal: 20, paddingBottom: 40 },
  success: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(22,163,74,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(22,163,74,0.3)',
    borderRadius: radii.md,
    padding: 12,
    marginTop: 4,
    marginBottom: 12,
  },
  successIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  flex: { flex: 1 },
  successText: { fontSize: 10, marginTop: 1 },
  pass: {
    borderRadius: 28,
    padding: 20,
    overflow: 'hidden',
    ...shadow,
  },
  passGlow: {
    position: 'absolute',
    width: 260,
    height: 260,
    borderRadius: 130,
    backgroundColor: 'rgba(255,255,255,0.06)',
    right: -90,
    top: -110,
  },
  passTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  logo: {
    width: 32,
    height: 32,
    borderRadius: 9,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoText: { fontSize: 20, lineHeight: 22 },
  brand: { letterSpacing: 1.5, lineHeight: 22 },
  brandSub: { fontSize: 7, letterSpacing: 1 },
  matchBlock: { marginTop: 22, gap: 4 },
  matchLabel: { fontSize: 8, letterSpacing: 0.8 },
  matchTitle: { fontSize: 29, lineHeight: 32 },
  teamsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 22,
    marginTop: 16,
  },
  team: { alignItems: 'center', gap: 5, width: 110 },
  teamBadge: {
    width: 46,
    height: 46,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  teamShort: { fontSize: 11, letterSpacing: 0.5 },
  teamLabel: { fontSize: 7, letterSpacing: 0.6, maxWidth: 110 },
  vs: { alignItems: 'center', justifyContent: 'center' },
  perforation: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: -20,
    marginTop: 20,
    marginBottom: 16,
    height: 22,
  },
  notchLeft: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.night,
    marginLeft: -11,
  },
  notchRight: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.night,
    marginRight: -11,
  },
  dash: {
    flex: 1,
    borderTopWidth: 1,
    borderStyle: 'dashed',
    borderColor: 'rgba(255,255,255,0.22)',
  },
  qrSection: { alignItems: 'center', gap: 9 },
  qrBox: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 6,
    overflow: 'hidden',
  },
  qrLoading: {
    width: 186,
    height: 186,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  qrError: { textAlign: 'center' },
  usedOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(15,23,42,0.72)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  usedText: { fontSize: 34, letterSpacing: 3 },
  scanRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  scanText: { fontSize: 8, letterSpacing: 0.9 },
  ticketId: { fontSize: 7, letterSpacing: 0.8 },
  passStats: {
    flexDirection: 'row',
    marginTop: 20,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.1)',
    gap: 10,
  },
  passStat: { flex: 1, gap: 3 },
  passStatLabel: { fontSize: 7, letterSpacing: 0.9 },
  passStatValue: { fontSize: 18, lineHeight: 21 },
  holderRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    marginTop: 16,
  },
  holderLabel: { fontSize: 7, letterSpacing: 0.9, marginBottom: 2 },
  holderRight: { alignItems: 'flex-end' },
  actions: { flexDirection: 'row', gap: 10, marginTop: 16 },
  actionButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: radii.md,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
  },
  actionGhost: { backgroundColor: 'transparent' },
  infoCard: {
    flexDirection: 'row',
    gap: 10,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.09)',
    borderRadius: radii.lg,
    padding: 14,
    marginTop: 16,
  },
  infoIcon: {
    width: 36,
    height: 36,
    borderRadius: 11,
    backgroundColor: 'rgba(244,196,48,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoText: { fontSize: 10, lineHeight: 16, marginTop: 3 },
  metaGrid: { flexDirection: 'row', gap: 8, marginTop: 12 },
  metaTile: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.09)',
    borderRadius: radii.md,
    padding: 11,
    gap: 3,
  },
  metaLabel: { fontSize: 7, letterSpacing: 0.8, marginTop: 2 },
  orderLink: { alignItems: 'center', marginTop: 20 },
  footer: { fontSize: 7, letterSpacing: 0.9, textAlign: 'center', marginTop: 16 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 30, gap: 10 },
  emptyTitle: { marginTop: 8 },
  emptyText: { textAlign: 'center' },
  emptyButton: {
    marginTop: 12,
    backgroundColor: colors.accent,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: radii.md,
  },
});
