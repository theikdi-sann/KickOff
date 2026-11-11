import { LinearGradient } from 'expo-linear-gradient';
import {
  ArrowUpRight,
  Bell,
  CalendarDays,
  Clock3,
  MapPin,
  Ticket as TicketIcon,
} from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import {
  bangkokGreeting,
  formatMatchDate,
  formatMatchTime,
  formatTHB,
} from '@kickoff/shared';
import { MatchCard, ResultRow } from '@/components/match-card';
import { NewsRow } from '@/components/news-row';
import {
  AppText,
  Card,
  Crest,
  EmptyState,
  LiveTag,
  PageScroll,
  Screen,
  SectionHeading,
  Skeleton,
} from '@/components/ui';
import { useMatches } from '@/lib/queries/matches';
import { useNews } from '@/lib/queries/news';
import { useProfile } from '@/lib/queries/profile';
import { useZones } from '@/lib/queries/seats';
import { useTickets } from '@/lib/queries/tickets';
import { colors, radii, shadow } from '@/lib/theme';

export default function HomeScreen() {
  const router = useRouter();
  const profileQuery = useProfile();
  const matchesQuery = useMatches();
  const newsQuery = useNews();
  const ticketsQuery = useTickets();

  const matches = matchesQuery.data ?? [];
  const news = newsQuery.data ?? [];
  const tickets = ticketsQuery.data ?? [];
  const upcoming = matches.filter((match) => match.status === 'upcoming');
  const results = matches.filter((match) => match.status === 'completed');
  const nextMatch = upcoming[0];
  const zonesQuery = useZones(nextMatch?.id);
  const zones = zonesQuery.data ?? [];

  const profile = profileQuery.data;
  const firstName = (profile?.fullName ?? 'there').split(' ')[0];
  const validTickets = tickets.filter((ticket) => ticket.status === 'valid');
  const minPrice = zones.length ? Math.min(...zones.map((zone) => zone.priceSatang)) : undefined;
  const seatsLeft = zones.reduce(
    (total, zone) => total + zone.rows.length * zone.seatsPerRow,
    0,
  );
  const featured = news[0];

  const loading = matchesQuery.isLoading || newsQuery.isLoading;
  const refreshing =
    matchesQuery.isRefetching || newsQuery.isRefetching || ticketsQuery.isRefetching;

  const refresh = () => {
    void matchesQuery.refetch();
    void newsQuery.refetch();
    void ticketsQuery.refetch();
  };

  return (
    <Screen>
      <PageScroll
        bottom={118}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.primary} />
        }>
        <View style={styles.header}>
          <View style={styles.brandRow}>
            <View style={styles.logo}>
              <AppText variant="h3" color={colors.ink} style={styles.logoText}>
                X
              </AppText>
            </View>
            <View>
              <AppText variant="h3" style={styles.brand}>
                KICKOFF
              </AppText>
              <AppText variant="caption" color={colors.muted} style={styles.brandSub}>
                MEMBER APP
              </AppText>
            </View>
          </View>
          <View style={styles.headerRight}>
            <LiveTag />
            <Pressable style={styles.iconButton} onPress={() => router.push('/tickets')}>
              <Bell size={18} color={colors.text} />
              {validTickets.length > 0 ? <View style={styles.notifDot} /> : null}
            </Pressable>
            <Pressable onPress={() => router.push('/profile')} style={styles.avatar}>
              <AppText variant="label" color="#FFFFFF">
                {profile?.initials ?? 'KO'}
              </AppText>
            </Pressable>
          </View>
        </View>

        <View style={styles.greeting}>
          <AppText variant="body" color={colors.muted}>
            {bangkokGreeting()}, {firstName}.
          </AppText>
          <AppText variant="h2" style={styles.greetingTitle}>
            Are you ready for match day?
          </AppText>
        </View>

        {loading ? (
          <View style={styles.heroWrap}>
            <Skeleton height={330} radius={22} />
          </View>
        ) : nextMatch ? (
          <Pressable
            onPress={() => router.push({ pathname: '/match/[id]', params: { id: nextMatch.id } })}
            style={({ pressed }) => [styles.heroWrap, pressed && { opacity: 0.96 }]}>
            <LinearGradient
              colors={nextMatch.posterColors}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.hero}>
              <View style={styles.heroGlow} />
              <View style={styles.heroTop}>
                <View style={styles.livePill}>
                  <View style={styles.liveDot} />
                  <AppText variant="caption" color="#FFFFFF" style={styles.liveText}>
                    NEXT HOME MATCH
                  </AppText>
                </View>
                <View style={styles.competition}>
                  <AppText variant="caption" color="rgba(255,255,255,0.6)" style={styles.compText}>
                    {nextMatch.competition.toUpperCase()}
                  </AppText>
                </View>
              </View>

              <View style={styles.heroTeams}>
                <View style={styles.heroTeam}>
                  <Crest short="KO" size={54} colors={[colors.primaryBright, colors.primaryDark]} />
                  <AppText variant="label" color="#FFFFFF">
                    KICKOFF
                  </AppText>
                </View>
                <View style={styles.heroCenter}>
                  <AppText variant="display" color="#FFFFFF" style={styles.heroVs}>
                    VS
                  </AppText>
                  <AppText variant="caption" color="rgba(255,255,255,0.55)" style={styles.heroKick}>
                    {formatMatchTime(nextMatch.kickoffAt)} KICK-OFF
                  </AppText>
                </View>
                <View style={styles.heroTeam}>
                  <Crest
                    short={nextMatch.opponentShort}
                    size={54}
                    colors={[nextMatch.accent, '#1E293B']}
                  />
                  <AppText variant="label" color="#FFFFFF" numberOfLines={1} style={styles.heroOpp}>
                    {nextMatch.opponent.toUpperCase()}
                  </AppText>
                </View>
              </View>

              <View style={styles.heroDivider} />

              <View style={styles.heroMeta}>
                <View style={styles.heroMetaItem}>
                  <CalendarDays size={14} color={colors.accent} />
                  <View>
                    <AppText variant="caption" color="rgba(255,255,255,0.5)" style={styles.metaLabel}>
                      DATE
                    </AppText>
                    <AppText variant="label" color="#FFFFFF">
                      {formatMatchDate(nextMatch.kickoffAt)}
                    </AppText>
                  </View>
                </View>
                <View style={styles.heroMetaItem}>
                  <MapPin size={14} color={colors.accent} />
                  <View>
                    <AppText variant="caption" color="rgba(255,255,255,0.5)" style={styles.metaLabel}>
                      VENUE
                    </AppText>
                    <AppText variant="label" color="#FFFFFF">
                      {nextMatch.venue}
                    </AppText>
                  </View>
                </View>
              </View>

              <View style={styles.heroFooter}>
                <View>
                  <AppText variant="caption" color="rgba(255,255,255,0.55)" style={styles.metaLabel}>
                    TICKETS FROM
                  </AppText>
                  <AppText variant="h2" color={colors.accent}>
                    {minPrice === undefined ? 'Not on sale' : formatTHB(minPrice)}
                  </AppText>
                </View>
                <View style={styles.heroButton}>
                  <AppText variant="label" color={colors.ink}>
                    Get tickets
                  </AppText>
                  <ArrowUpRight size={15} color={colors.ink} />
                </View>
              </View>
            </LinearGradient>
          </Pressable>
        ) : (
          <Card style={styles.heroWrap}>
            <EmptyState
              title="No fixtures on sale"
              description="The next home fixture will appear here as soon as the club publishes it."
            />
          </Card>
        )}

        <View style={styles.statsRow}>
          <Stat
            value={String(validTickets.length)}
            label="Active passes"
            icon={<TicketIcon size={15} color={colors.primary} />}
          />
          <Stat
            value={String(upcoming.length)}
            label="Home fixtures"
            icon={<CalendarDays size={15} color={colors.primary} />}
          />
          <Stat
            value={String(seatsLeft)}
            label="Seats on sale"
            icon={<MapPin size={15} color={colors.primary} />}
          />
        </View>

        <View style={styles.section}>
          <SectionHeading
            title="Upcoming fixtures"
            action={upcoming.length > 0 ? 'See all' : undefined}
            onAction={() => router.push('/fixtures')}
          />
          {matchesQuery.isLoading ? (
            <Skeleton height={232} radius={22} />
          ) : upcoming.length === 0 ? (
            <EmptyState title="No upcoming fixtures" description="Check back soon for the next match." />
          ) : (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.horizontal}>
              {upcoming.map((match) => (
                <MatchCard
                  key={match.id}
                  match={match}
                  onPress={() => router.push({ pathname: '/match/[id]', params: { id: match.id } })}
                />
              ))}
            </ScrollView>
          )}
        </View>

        <View style={styles.section}>
          <SectionHeading
            title="Latest news"
            action={news.length > 1 ? 'See all' : undefined}
            onAction={() => router.push('/news')}
          />
          {newsQuery.isLoading ? (
            <Skeleton height={300} radius={22} />
          ) : !featured ? (
            <EmptyState title="No news yet" description="Club updates will land here." />
          ) : (
            <>
              <Pressable
                onPress={() => router.push({ pathname: '/news/[id]', params: { id: featured.id } })}
                style={({ pressed }) => [styles.featureCard, pressed && { opacity: 0.94 }]}>
                <LinearGradient
                  colors={featured.imageColors}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.featureImage}>
                  <View style={styles.featureBadge}>
                    <AppText variant="caption" color="#FFFFFF" style={styles.featureBadgeText}>
                      {featured.category.toUpperCase()}
                    </AppText>
                  </View>
                  <View style={styles.featureMark}>
                    <AppText
                      variant="display"
                      color="rgba(255,255,255,0.14)"
                      style={styles.featureMarkText}>
                      KO
                    </AppText>
                  </View>
                </LinearGradient>
                <View style={styles.featureBody}>
                  <AppText variant="h3" numberOfLines={2}>
                    {featured.title}
                  </AppText>
                  <AppText
                    variant="small"
                    color={colors.muted}
                    numberOfLines={2}
                    style={styles.featureExcerpt}>
                    {featured.excerpt}
                  </AppText>
                  <View style={styles.newsMeta}>
                    <Clock3 size={11} color={colors.muted} />
                    <AppText variant="caption" color={colors.muted} style={styles.newsMetaText}>
                      {featured.readMinutes} MIN READ ·{' '}
                      {formatMatchDate(featured.publishedAt).toUpperCase()}
                    </AppText>
                  </View>
                </View>
              </Pressable>

              {news.length > 1 ? (
                <Card style={styles.newsList}>
                  {news.slice(1, 4).map((item, index) => (
                    <NewsRow
                      key={item.id}
                      item={item}
                      last={index === Math.min(news.length, 4) - 2}
                      onPress={() =>
                        router.push({ pathname: '/news/[id]', params: { id: item.id } })
                      }
                    />
                  ))}
                </Card>
              ) : null}
            </>
          )}
        </View>

        <View style={styles.section}>
          <SectionHeading title="Recent results" />
          <Card style={styles.resultsCard}>
            {results.length === 0 ? (
              <EmptyState title="No results yet" description="Completed matches will be listed here." />
            ) : (
              results.map((match, index) => (
                <View key={match.id} style={index === results.length - 1 && { borderBottomWidth: 0 }}>
                  <ResultRow match={match} />
                </View>
              ))
            )}
          </Card>
        </View>

        <View style={styles.footerNote}>
          <AppText variant="caption" color={colors.muted} style={styles.footerText}>
            KICKOFF · SECURE TICKETS, LIVE GATE VALIDATION
          </AppText>
        </View>
      </PageScroll>
    </Screen>
  );
}

function Stat({ value, label, icon }: { value: string; label: string; icon: React.ReactNode }) {
  return (
    <View style={styles.stat}>
      <View style={styles.statIcon}>{icon}</View>
      <View>
        <AppText variant="h3" style={styles.statValue}>
          {value}
        </AppText>
        <AppText variant="caption" color={colors.muted} style={styles.statLabel}>
          {label.toUpperCase()}
        </AppText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 10,
  },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  logo: {
    width: 36,
    height: 36,
    borderRadius: 11,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoText: { fontSize: 23, lineHeight: 25 },
  brand: { letterSpacing: 1.4, lineHeight: 25 },
  brandSub: { fontSize: 8, letterSpacing: 1.2 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  iconButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notifDot: {
    position: 'absolute',
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.danger,
    top: 9,
    right: 10,
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  greeting: { paddingHorizontal: 20, marginTop: 22, gap: 3 },
  greetingTitle: { fontSize: 28 },
  heroWrap: { marginHorizontal: 20, marginTop: 16, borderRadius: radii.xl, ...shadow },
  hero: { borderRadius: radii.xl, padding: 18, overflow: 'hidden' },
  heroGlow: {
    position: 'absolute',
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: 'rgba(255,255,255,0.07)',
    right: -80,
    top: -70,
  },
  heroTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  livePill: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.accent },
  liveText: { fontSize: 9, letterSpacing: 1.1 },
  competition: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
  },
  compText: { fontSize: 8, letterSpacing: 0.8 },
  heroTeams: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 23,
    paddingHorizontal: 4,
  },
  heroTeam: { alignItems: 'center', gap: 7, width: 100 },
  heroOpp: { fontSize: 9, maxWidth: 100 },
  heroCenter: { alignItems: 'center', gap: 2 },
  heroVs: { fontSize: 30, lineHeight: 32, letterSpacing: 1 },
  heroKick: { fontSize: 8, letterSpacing: 0.7 },
  heroDivider: {
    borderTopWidth: 1,
    borderStyle: 'dashed',
    borderColor: 'rgba(255,255,255,0.14)',
    marginVertical: 17,
  },
  heroMeta: { flexDirection: 'row', gap: 24 },
  heroMetaItem: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  metaLabel: { fontSize: 8, letterSpacing: 0.9 },
  heroFooter: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    marginTop: 18,
  },
  heroButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.accent,
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: 13,
  },
  statsRow: { flexDirection: 'row', gap: 8, marginHorizontal: 20, marginTop: 14 },
  stat: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    backgroundColor: '#FFFFFF',
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: 10,
    paddingVertical: 11,
  },
  statIcon: {
    width: 28,
    height: 28,
    borderRadius: 9,
    backgroundColor: colors.softGreen,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statValue: { fontSize: 18, lineHeight: 20 },
  statLabel: { fontSize: 7, letterSpacing: 0.5 },
  section: { marginTop: 28, paddingLeft: 20 },
  horizontal: { paddingRight: 20 },
  featureCard: {
    marginRight: 20,
    backgroundColor: '#FFFFFF',
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.line,
    overflow: 'hidden',
    ...shadow,
  },
  featureImage: { height: 132, padding: 14, justifyContent: 'space-between' },
  featureBadge: {
    backgroundColor: 'rgba(0,0,0,0.3)',
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
  },
  featureBadgeText: { fontSize: 8, letterSpacing: 0.8 },
  featureMark: { position: 'absolute', right: 16, bottom: -18 },
  featureMarkText: { fontSize: 86, lineHeight: 90, letterSpacing: 2 },
  featureBody: { padding: 15, gap: 6 },
  featureExcerpt: { fontSize: 12, lineHeight: 18 },
  newsMeta: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  newsMetaText: { fontSize: 9, letterSpacing: 0.35 },
  newsList: { marginRight: 20, paddingHorizontal: 14, marginTop: 12 },
  resultsCard: { marginRight: 20, paddingHorizontal: 14 },
  footerNote: { paddingHorizontal: 20, marginTop: 26 },
  footerText: { fontSize: 8, letterSpacing: 0.7, textAlign: 'center' },
});
