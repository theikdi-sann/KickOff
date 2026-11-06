import { LinearGradient } from 'expo-linear-gradient';
import { CalendarDays, ChevronRight, MapPin } from 'lucide-react-native';
import { Pressable, StyleSheet, View } from 'react-native';

import { formatMatchDate, formatMatchTime, formatTHB, minimumPrice, type Match } from '@xclub/shared';

import { AppText, Crest, Pill } from '@/components/ui';
import { colors, fonts, radii, shadow } from '@/lib/theme';

export function MatchCard({ match, onPress }: { match: Match; onPress: () => void }) {
  const price = minimumPrice(match.id);
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.cardWrap, pressed && { opacity: 0.9 }]}>
      <LinearGradient
        colors={match.posterColors}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.card}>
        <View style={styles.glow} />
        <View style={styles.topRow}>
          <Pill label={match.competition.toUpperCase()} tone="dark" />
          <ChevronRight size={17} color="rgba(255,255,255,0.7)" />
        </View>
        <View style={styles.teams}>
          <Crest short="XC" size={46} colors={['#16A34A', '#064E2B']} />
          <AppText variant="caption" color="rgba(255,255,255,0.5)" style={styles.vs}>
            VS
          </AppText>
          <Crest short={match.opponentShort} size={46} colors={[match.accent, '#1E293B']} />
        </View>
        <AppText variant="h3" color="#FFFFFF" numberOfLines={1} style={styles.opponent}>
          {match.opponent}
        </AppText>
        <View style={styles.metaRow}>
          <CalendarDays size={12} color={colors.accent} />
          <AppText variant="small" color="rgba(255,255,255,0.82)">
            {formatMatchDate(match.kickoffAt)} · {formatMatchTime(match.kickoffAt)}
          </AppText>
        </View>
        <View style={styles.priceRow}>
          <AppText variant="caption" color="rgba(255,255,255,0.55)">
            FROM
          </AppText>
          <AppText variant="h3" color={colors.accent}>
            {formatTHB(price)}
          </AppText>
        </View>
      </LinearGradient>
    </Pressable>
  );
}

export function ResultRow({ match, onPress }: { match: Match; onPress?: () => void }) {
  const win = (match.homeScore ?? 0) > (match.awayScore ?? 0);
  const draw = (match.homeScore ?? 0) === (match.awayScore ?? 0);
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.result, pressed && { opacity: 0.7 }]}>
      <Crest short={match.opponentShort} size={40} colors={[match.accent, '#1E293B']} />
      <View style={styles.resultInfo}>
        <AppText variant="label">{match.opponent}</AppText>
        <View style={styles.resultMeta}>
          <MapPin size={11} color={colors.muted} />
          <AppText variant="caption" color={colors.muted} style={styles.resultMetaText}>
            {match.homeAway === 'home' ? 'HOME' : 'AWAY'} · {formatMatchDate(match.kickoffAt).toUpperCase()}
          </AppText>
        </View>
      </View>
      <View style={styles.scoreBox}>
        <AppText variant="h3" color={win ? colors.primary : draw ? colors.warning : colors.danger}>
          {match.homeScore}–{match.awayScore}
        </AppText>
      </View>
      <Pill label={win ? 'WIN' : draw ? 'DRAW' : 'LOSS'} tone={win ? 'green' : draw ? 'gold' : 'red'} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  cardWrap: { width: 278, marginRight: 12 },
  card: {
    borderRadius: radii.lg,
    padding: 16,
    overflow: 'hidden',
    minHeight: 232,
    ...shadow,
  },
  glow: {
    position: 'absolute',
    width: 170,
    height: 170,
    borderRadius: 85,
    backgroundColor: 'rgba(255,255,255,0.08)',
    right: -60,
    top: -60,
  },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  teams: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 18 },
  vs: { letterSpacing: 1.5, marginHorizontal: 2 },
  opponent: { marginTop: 12, letterSpacing: 0.2 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 6 },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
    marginTop: 'auto',
    paddingTop: 14,
  },
  result: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  resultInfo: { flex: 1, gap: 3 },
  resultMeta: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  resultMetaText: { fontSize: 9, letterSpacing: 0.4 },
  scoreBox: { minWidth: 48, alignItems: 'center' },
  font: { fontFamily: fonts.bold },
});
