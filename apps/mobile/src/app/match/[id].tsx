import { LinearGradient } from 'expo-linear-gradient';
import {
  ChevronLeft,
  Clock3,
  Info,
  MapPin,
  ShieldCheck,
  Ticket as TicketIcon,
  Users,
} from 'lucide-react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import {
  formatFullDate,
  formatMatchTime,
  formatTHB,
  minimumPrice,
  mockMatches,
  mockZones,
  zoneAvailability,
  type Match,
  type Zone,
} from '@xclub/shared';
import {
  AppText,
  Card,
  Crest,
  MockTag,
  PageScroll,
  Pill,
  Screen,
} from '@/components/ui';
import { colors, radii, shadow } from '@/lib/theme';

export default function MatchDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const match = mockMatches.find((item) => item.id === id) ?? mockMatches[0];
  const zones = mockZones.filter((zone) => zone.matchId === match.id);
  const completed = match.status === 'completed';

  return (
    <Screen style={{ backgroundColor: colors.bg }}>
      <StatusBar style="light" />
      <PageScroll bottom={40} contentStyle={{ paddingBottom: 44 }}>
        <MatchHero match={match} onBack={() => router.back()} />

        <View style={styles.body}>
          {completed ? (
            <Card style={styles.resultCard}>
              <AppText variant="caption" color={colors.muted} style={styles.caption}>
                FULL TIME
              </AppText>
              <View style={styles.resultRow}>
                <Crest short="XC" size={46} colors={['#16A34A', '#064E2B']} />
                <AppText variant="display" style={styles.score}>
                  {match.homeScore} – {match.awayScore}
                </AppText>
                <Crest short={match.opponentShort} size={46} colors={[match.accent, '#1E293B']} />
              </View>
              <AppText variant="small" color={colors.muted} style={styles.centerText}>
                This fixture has ended. Match report is available in the club feed.
              </AppText>
            </Card>
          ) : zones.length === 0 ? (
            <Card style={styles.notOnSaleCard}>
              <View style={styles.notOnSaleIcon}>
                <TicketIcon size={22} color={colors.muted} />
              </View>
              <AppText variant="h3">Not on sale</AppText>
              <AppText variant="small" color={colors.muted} style={styles.centerText}>
                Tickets for this fixture are not available yet. Check back when the club opens
                seating.
              </AppText>
            </Card>
          ) : (
            <>
              <View style={styles.sectionHeader}>
                <View>
                  <AppText variant="caption" color={colors.primary} style={styles.caption}>
                    CHOOSE YOUR VIEW
                  </AppText>
                  <AppText variant="h2">Seating zones</AppText>
                </View>
                <MockTag />
              </View>

              <View style={styles.zoneList}>
                {zones.map((zone) => (
                  <ZoneRow
                    key={zone.id}
                    zone={zone}
                    onPress={() =>
                      router.push({
                        pathname: '/seats/[matchId]',
                        params: { matchId: match.id, zoneId: zone.id },
                      })
                    }
                  />
                ))}
              </View>

              <Card style={styles.mapCard}>
                <View style={styles.mapHeader}>
                  <AppText variant="label">Stadium overview</AppText>
                  <Pill label="XCLUB ARENA" tone="muted" />
                </View>
                <View style={styles.map}>
                  <View style={styles.pitch}>
                    <View style={styles.pitchLine} />
                    <View style={styles.pitchCircle} />
                  </View>
                  <View style={[styles.stand, styles.standNorth]}>
                    <AppText variant="caption" color="#FFFFFF" style={styles.standText}>
                      NORTH
                    </AppText>
                  </View>
                  <View style={[styles.stand, styles.standEast]}>
                    <AppText variant="caption" color={colors.ink} style={styles.standText}>
                      EAST
                    </AppText>
                  </View>
                  <View style={[styles.stand, styles.standVip]}>
                    <AppText variant="caption" color="#FFFFFF" style={styles.standText}>
                      VIP
                    </AppText>
                  </View>
                </View>
                <AppText variant="small" color={colors.muted} style={styles.mapNote}>
                  Interactive seat maps are a post-MVP feature. Zones are configured by the club admin.
                </AppText>
              </Card>
            </>
          )}

          <AppText variant="h2" style={styles.infoTitle}>
            Match information
          </AppText>
          <View style={styles.infoGrid}>
            <InfoTile icon={<Clock3 size={16} color={colors.primary} />} label="KICK-OFF" value={formatMatchTime(match.kickoffAt)} />
            <InfoTile icon={<MapPin size={16} color={colors.primary} />} label="VENUE" value={match.venue} />
            <InfoTile icon={<Users size={16} color={colors.primary} />} label="GATES OPEN" value="16:00" />
            <InfoTile icon={<ShieldCheck size={16} color={colors.primary} />} label="ENTRY" value="Gate 2" />
          </View>

          <Card style={styles.entryCard}>
            <View style={styles.entryIcon}>
              <TicketIcon size={21} color={colors.primary} />
            </View>
            <View style={styles.flex}>
              <AppText variant="label">How your pass works</AppText>
              <AppText variant="small" color={colors.muted} style={styles.entryText}>
                Buy your seat, show the QR at the gate, and staff will mark it used. One scan per
                pass. Keep the pass on your phone — screenshots are not accepted.
              </AppText>
            </View>
          </Card>

          <View style={styles.notice}>
            <Info size={14} color={colors.warning} />
            <AppText variant="caption" color="#8A6400" style={styles.noticeText}>
              PHASE A PROTOTYPE · PAYMENT AND TICKET ISSUING ARE SIMULATED
            </AppText>
          </View>
        </View>
      </PageScroll>
    </Screen>
  );
}

function MatchHero({ match, onBack }: { match: Match; onBack: () => void }) {
  const completed = match.status === 'completed';
  const price = minimumPrice(match.id);
  const onSale = price > 0;
  return (
    <LinearGradient
      colors={match.posterColors}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.hero}>
      <View style={styles.heroGlow} />
      <View style={styles.heroGlowSmall} />
      <View style={styles.heroTop}>
        <Pressable onPress={onBack} style={styles.back}>
          <ChevronLeft size={22} color="#FFFFFF" />
        </Pressable>
        <MockTag dark />
        <View style={styles.heroTopSpacer} />
      </View>

      <View style={styles.heroLabelRow}>
        <AppText variant="caption" color={colors.accent} style={styles.heroEyebrow}>
          {completed ? 'FINAL SCORE' : match.competition.toUpperCase()}
        </AppText>
        <AppText variant="caption" color="rgba(255,255,255,0.5)" style={styles.heroEyebrow}>
          MATCHDAY
        </AppText>
      </View>

      <View style={styles.heroTeams}>
        <View style={styles.team}>
          <Crest short="XC" size={72} colors={['#16A34A', '#064E2B']} />
          <AppText variant="h3" color="#FFFFFF">
            XCLUB
          </AppText>
          <AppText variant="caption" color="rgba(255,255,255,0.5)" style={styles.homeAway}>
            HOME
          </AppText>
        </View>
        <View style={styles.heroCenter}>
          {completed ? (
            <AppText variant="display" color="#FFFFFF" style={styles.heroScore}>
              {match.homeScore}–{match.awayScore}
            </AppText>
          ) : (
            <>
              <AppText variant="display" color="rgba(255,255,255,0.35)" style={styles.heroVs}>
                VS
              </AppText>
              <AppText variant="caption" color="rgba(255,255,255,0.55)" style={styles.heroKick}>
                {formatMatchTime(match.kickoffAt)}
              </AppText>
            </>
          )}
        </View>
        <View style={styles.team}>
          <Crest short={match.opponentShort} size={72} colors={[match.accent, '#1E293B']} />
          <AppText variant="h3" color="#FFFFFF" numberOfLines={1} style={styles.opponent}>
            {match.opponent.toUpperCase()}
          </AppText>
          <AppText variant="caption" color="rgba(255,255,255,0.5)" style={styles.homeAway}>
            AWAY
          </AppText>
        </View>
      </View>

      <View style={styles.heroDivider} />

      <View style={styles.heroMeta}>
        <View style={styles.metaItem}>
          <AppText variant="caption" color="rgba(255,255,255,0.45)" style={styles.metaLabel}>
            DATE
          </AppText>
          <AppText variant="label" color="#FFFFFF">
            {formatFullDate(match.kickoffAt)}
          </AppText>
        </View>
        <View style={styles.metaItem}>
          <AppText variant="caption" color="rgba(255,255,255,0.45)" style={styles.metaLabel}>
            VENUE
          </AppText>
          <AppText variant="label" color="#FFFFFF">
            {match.venue}
          </AppText>
        </View>
      </View>

      {!completed ? (
        <View style={styles.heroCta}>
          <View>
            <AppText variant="caption" color="rgba(255,255,255,0.5)" style={styles.metaLabel}>
              {onSale ? 'TICKETS FROM' : 'TICKETS'}
            </AppText>
            <AppText variant="h2" color={onSale ? colors.accent : '#FFFFFF'}>
              {onSale ? formatTHB(price) : 'Not on sale'}
            </AppText>
          </View>
          <View style={styles.availablePill}>
            <View style={[styles.availableDot, !onSale && { backgroundColor: colors.muted }]} />
            <AppText variant="caption" color="#FFFFFF" style={styles.availableText}>
              {onSale ? 'SEATS AVAILABLE' : 'COMING SOON'}
            </AppText>
          </View>
        </View>
      ) : null}
    </LinearGradient>
  );
}

function ZoneRow({ zone, onPress }: { zone: Zone; onPress: () => void }) {
  const availability = zoneAvailability(zone);
  const soldOut = availability.available === 0;
  return (
    <Pressable
      onPress={onPress}
      disabled={soldOut}
      style={({ pressed }) => [styles.zone, pressed && { opacity: 0.85 }, soldOut && { opacity: 0.55 }]}>
      <View style={[styles.zoneColor, { backgroundColor: zone.color }]} />
      <View style={styles.flex}>
        <View style={styles.zoneNameRow}>
          <AppText variant="label">{zone.name}</AppText>
          <Pill label={soldOut ? 'SOLD OUT' : `${availability.available} LEFT`} tone={soldOut ? 'red' : 'green'} />
        </View>
        <AppText variant="small" color={colors.muted} style={styles.zoneDesc}>
          {zone.description}
        </AppText>
        <View style={styles.zoneMeta}>
          <AppText variant="caption" color={colors.muted} style={styles.zoneMetaText}>
            ROWS {zone.rows[0]}–{zone.rows[zone.rows.length - 1]}
          </AppText>
          <View style={styles.zoneDot} />
          <AppText variant="caption" color={colors.muted} style={styles.zoneMetaText}>
            {availability.total} SEATS
          </AppText>
        </View>
      </View>
      <View style={styles.zoneRight}>
        <AppText variant="h3">{formatTHB(zone.priceSatang)}</AppText>
        <AppText variant="caption" color={colors.primary} style={styles.selectText}>
          SELECT
        </AppText>
      </View>
    </Pressable>
  );
}

function InfoTile({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <Card style={styles.infoTile}>
      <View style={styles.infoIcon}>{icon}</View>
      <AppText variant="caption" color={colors.muted} style={styles.infoLabel}>
        {label}
      </AppText>
      <AppText variant="label" style={styles.infoValue}>
        {value}
      </AppText>
    </Card>
  );
}

const styles = StyleSheet.create({
  hero: {
    paddingTop: 8,
    paddingHorizontal: 20,
    paddingBottom: 24,
    borderBottomLeftRadius: 32,
    borderBottomRightRadius: 32,
    overflow: 'hidden',
  },
  heroGlow: {
    position: 'absolute',
    width: 260,
    height: 260,
    borderRadius: 130,
    backgroundColor: 'rgba(255,255,255,0.06)',
    right: -100,
    top: -90,
  },
  heroGlowSmall: {
    position: 'absolute',
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(244,196,48,0.08)',
    left: -40,
    bottom: 40,
  },
  heroTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  back: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroTopSpacer: { width: 40 },
  heroLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 22,
  },
  heroEyebrow: { fontSize: 9, letterSpacing: 1.1 },
  heroTeams: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginTop: 18,
  },
  team: { alignItems: 'center', gap: 7, width: 105 },
  homeAway: { fontSize: 8, letterSpacing: 0.9 },
  heroCenter: { alignItems: 'center', justifyContent: 'center', paddingTop: 18 },
  heroVs: { fontSize: 34, lineHeight: 38, letterSpacing: 2 },
  heroKick: { fontSize: 10, letterSpacing: 0.7 },
  heroScore: { fontSize: 42, lineHeight: 46 },
  opponent: { fontSize: 19, maxWidth: 110 },
  heroDivider: {
    borderTopWidth: 1,
    borderStyle: 'dashed',
    borderColor: 'rgba(255,255,255,0.16)',
    marginTop: 20,
    marginBottom: 16,
  },
  heroMeta: { flexDirection: 'row', gap: 30 },
  metaItem: { gap: 3 },
  metaLabel: { fontSize: 8, letterSpacing: 0.9 },
  heroCta: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    marginTop: 20,
  },
  availablePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  availableDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: colors.primaryBright },
  availableText: { fontSize: 8, letterSpacing: 0.8 },
  body: { paddingHorizontal: 20, paddingTop: 22 },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  caption: { fontSize: 9, letterSpacing: 1, marginBottom: 3 },
  zoneList: { gap: 10 },
  zone: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#FFFFFF',
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 14,
    overflow: 'hidden',
    ...shadow,
  },
  zoneColor: { width: 5, alignSelf: 'stretch', borderRadius: 3 },
  flex: { flex: 1 },
  zoneNameRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  zoneDesc: { fontSize: 11, marginTop: 2 },
  zoneMeta: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 7 },
  zoneMetaText: { fontSize: 8, letterSpacing: 0.5 },
  zoneDot: { width: 3, height: 3, borderRadius: 2, backgroundColor: colors.muted },
  zoneRight: { alignItems: 'flex-end', gap: 3 },
  selectText: { fontSize: 8, letterSpacing: 0.8 },
  mapCard: { marginTop: 16, padding: 15 },
  mapHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  map: {
    height: 150,
    borderRadius: radii.md,
    backgroundColor: '#0F2A1C',
    marginTop: 12,
    padding: 12,
    justifyContent: 'center',
  },
  pitch: {
    flex: 1,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
    marginHorizontal: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pitchLine: {
    position: 'absolute',
    width: '100%',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.18)',
  },
  pitchCircle: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  stand: {
    position: 'absolute',
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  standNorth: {
    left: '32%',
    right: '32%',
    top: 3,
    height: 17,
    backgroundColor: 'rgba(34,197,94,0.8)',
  },
  standEast: {
    right: 3,
    top: '32%',
    bottom: '32%',
    width: 18,
    backgroundColor: 'rgba(244,196,48,0.85)',
  },
  standVip: {
    left: 3,
    top: '34%',
    bottom: '34%',
    width: 18,
    backgroundColor: 'rgba(139,92,246,0.85)',
  },
  standText: { fontSize: 7, letterSpacing: 0.5 },
  mapNote: { fontSize: 10, lineHeight: 15, marginTop: 9 },
  resultCard: { padding: 20, alignItems: 'center', gap: 12 },
  notOnSaleCard: { padding: 20, alignItems: 'center', gap: 10 },
  notOnSaleIcon: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resultRow: { flexDirection: 'row', alignItems: 'center', gap: 22 },
  score: { fontSize: 44, lineHeight: 48 },
  centerText: { textAlign: 'center' },
  infoTitle: { marginTop: 28, marginBottom: 12 },
  infoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  infoTile: { width: '48.5%', padding: 13, gap: 5 },
  infoIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: colors.softGreen,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  infoLabel: { fontSize: 8, letterSpacing: 0.8 },
  infoValue: { fontSize: 12 },
  entryCard: { marginTop: 12, padding: 15, flexDirection: 'row', gap: 12 },
  entryIcon: {
    width: 44,
    height: 44,
    borderRadius: 13,
    backgroundColor: colors.softGreen,
    alignItems: 'center',
    justifyContent: 'center',
  },
  entryText: { fontSize: 11, lineHeight: 17, marginTop: 3 },
  notice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 20,
    justifyContent: 'center',
  },
  noticeText: { fontSize: 8, letterSpacing: 0.6 },
});
