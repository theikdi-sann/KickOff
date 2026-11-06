import { LinearGradient } from 'expo-linear-gradient';
import { CalendarDays, MapPin, QrCode } from 'lucide-react-native';
import { Pressable, StyleSheet, View } from 'react-native';

import { formatMatchDate, formatMatchTime, formatTHB, type Ticket } from '@xclub/shared';

import { AppText, Pill } from '@/components/ui';
import { colors, radii, shadow } from '@/lib/theme';

export function TicketCard({
  ticket,
  onPress,
  compact = false,
}: {
  ticket: Ticket;
  onPress: () => void;
  compact?: boolean;
}) {
  const used = ticket.status === 'used';
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.wrap, used && { opacity: 0.72 }, pressed && { opacity: 0.9 }]}>
      <LinearGradient
        colors={used ? ['#334155', '#1E293B'] : ['#0B6B3A', '#064E2B']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.accent}>
        <AppText variant="caption" color="rgba(255,255,255,0.55)" style={styles.rotated}>
          MATCH PASS
        </AppText>
      </LinearGradient>
      <View style={styles.body}>
        <View style={styles.top}>
          <View style={styles.teams}>
            <View style={styles.crest}>
              <AppText variant="h3" color="#FFFFFF">
                XC
              </AppText>
            </View>
            <View style={styles.flex}>
              <AppText variant="label" numberOfLines={1}>
                XClub vs {ticket.opponent}
              </AppText>
              <View style={styles.meta}>
                <CalendarDays size={11} color={colors.muted} />
                <AppText variant="caption" color={colors.muted} style={styles.metaText}>
                  {formatMatchDate(ticket.kickoffAt).toUpperCase()} · {formatMatchTime(ticket.kickoffAt)}
                </AppText>
              </View>
            </View>
            <Pill label={used ? 'USED' : 'VALID'} tone={used ? 'muted' : 'green'} />
          </View>
        </View>

        <View style={styles.seatRow}>
          <SeatCell label="ZONE" value={ticket.zoneName} />
          <SeatCell label="ROW" value={ticket.row} />
          <SeatCell label="SEAT" value={String(ticket.number)} />
          <View style={styles.qrMini}>
            <QrCode size={compact ? 20 : 24} color={colors.primary} />
          </View>
        </View>

        <View style={styles.footer}>
          <View style={styles.meta}>
            <MapPin size={11} color={colors.muted} />
            <AppText variant="caption" color={colors.muted} style={styles.metaText}>
              {ticket.venue.toUpperCase()}
            </AppText>
          </View>
          <AppText variant="label" color={colors.primary}>
            {formatTHB(ticket.priceSatang)}
          </AppText>
        </View>
      </View>
    </Pressable>
  );
}

function SeatCell({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.seatCell}>
      <AppText variant="caption" color={colors.muted} style={styles.seatLabel}>
        {label}
      </AppText>
      <AppText variant="label" numberOfLines={1} style={styles.seatValue}>
        {value}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.line,
    overflow: 'hidden',
    ...shadow,
  },
  accent: { width: 32, alignItems: 'center', justifyContent: 'center' },
  rotated: { transform: [{ rotate: '-90deg' }], width: 90, textAlign: 'center', letterSpacing: 1.5 },
  body: { flex: 1, padding: 14, gap: 13 },
  top: { flexDirection: 'row' },
  teams: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  crest: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  flex: { flex: 1, gap: 3 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { fontSize: 9, letterSpacing: 0.3 },
  seatRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingTop: 11,
    borderTopWidth: 1,
    borderStyle: 'dashed',
    borderTopColor: colors.line,
  },
  seatCell: { minWidth: 52, maxWidth: 104, flexShrink: 1 },
  seatLabel: { fontSize: 8, letterSpacing: 0.9 },
  seatValue: { fontSize: 12, marginTop: 2 },
  qrMini: {
    marginLeft: 'auto',
    width: 42,
    height: 42,
    borderRadius: 10,
    backgroundColor: colors.softGreen,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 2,
  },
});
