import { ChevronLeft, ChevronRight, Clock3, CloudOff, MapPin } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { formatMatchDate, formatMatchTime, type MatchDto } from '@kickoff/shared';
import { ResultRow } from '@/components/match-card';
import { AppText, Card, Crest, EmptyState, LiveTag, PrimaryButton, Screen, SectionHeading, Skeleton } from '@/components/ui';
import { useTranslator } from '@/lib/i18n';
import { useMatches } from '@/lib/queries/matches';
import { useTenantDisplay } from '@/lib/queries/tenant';
import { colors, radii } from '@/lib/theme';

/**
 * Full fixture list — the destination of the home feed's "See all".
 * Every upcoming fixture and every result, uncut.
 */
export default function FixturesScreen() {
  const t = useTranslator();
  const router = useRouter();
  const matchesQuery = useMatches();

  const matches = matchesQuery.data ?? [];
  const upcoming = matches.filter((match) => match.status === 'upcoming');
  const results = matches.filter((match) => match.status === 'completed');

  const refresh = () => void matchesQuery.refetch();

  return (
    <Screen>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.iconButton}>
          <ChevronLeft size={21} color={colors.text} />
        </Pressable>
        <View style={styles.headerCenter}>
          <AppText variant="h3">{t('Fixtures')}</AppText>
          <AppText variant="caption" color={colors.muted} style={styles.headerSub}>
            {upcoming.length} UPCOMING · {results.length} PLAYED
          </AppText>
        </View>
        <LiveTag />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl
            refreshing={matchesQuery.isRefetching}
            onRefresh={refresh}
            tintColor={colors.primary}
          />
        }>
        {matchesQuery.isLoading ? (
          <View style={styles.skeletons}>
            <Skeleton height={172} radius={18} />
            <Skeleton height={172} radius={18} />
          </View>
        ) : matchesQuery.error ? (
          <Card style={styles.empty}>
            <EmptyState
              title={t('Could not load the fixtures')}
              description={
                matchesQuery.error instanceof Error
                  ? matchesQuery.error.message
                  : 'Check your connection and try again.'
              }
              icon={<CloudOff size={26} color={colors.muted} />}
            />
            <View style={styles.retry}>
              <PrimaryButton label={t('Try again')} onPress={refresh} />
            </View>
          </Card>
        ) : (
          <>
            <SectionHeading title={t('Upcoming')} />
            {upcoming.length === 0 ? (
              <Card style={styles.empty}>
                <EmptyState
                  title={t('No upcoming fixtures')}
                  description={t('The next home fixture will appear here as soon as the club publishes it.')}
                />
              </Card>
            ) : (
              <View style={styles.list}>
                {upcoming.map((match) => (
                  <FixtureRow
                    key={match.id}
                    match={match}
                    onPress={() =>
                      router.push({ pathname: '/match/[id]', params: { id: match.id } })
                    }
                  />
                ))}
              </View>
            )}

            <SectionHeading title={t('Recent results')} />
            <Card style={styles.resultsCard}>
              {results.length === 0 ? (
                <EmptyState
                  title={t('No results yet')}
                  description={t('Completed matches will be listed here.')}
                />
              ) : (
                results.map((match, index) => (
                  <View key={match.id} style={index === results.length - 1 && { borderBottomWidth: 0 }}>
                    <ResultRow match={match} />
                  </View>
                ))
              )}
            </Card>
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

function FixtureRow({ match, onPress }: { match: MatchDto; onPress: () => void }) {
  const t = useTranslator();
  const display = useTenantDisplay();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && { opacity: 0.75 }]}>
      <Crest short={match.opponentShort} size={42} colors={[match.accent, '#1E293B']} />
      <View style={styles.rowInfo}>
        <AppText variant="label" numberOfLines={1}>
          {t('KickOff vs {opponent}', { opponent: match.opponent })}
        </AppText>
        <View style={styles.rowMeta}>
          <Clock3 size={11} color={colors.muted} />
          <AppText variant="caption" color={colors.muted} style={styles.rowMetaText}>
            {formatMatchDate(match.kickoffAt, { timezone: display.timezone, locale: display.locale }).toUpperCase()} ·{' '}
            {formatMatchTime(match.kickoffAt, { timezone: display.timezone, locale: display.locale })}
          </AppText>
        </View>
        <View style={styles.rowMeta}>
          <MapPin size={11} color={colors.muted} />
          <AppText variant="caption" color={colors.muted} style={styles.rowMetaText}>
            {match.venue.toUpperCase()} · {match.competition.toUpperCase()}
          </AppText>
        </View>
      </View>
      <ChevronRight size={17} color={colors.muted} />
    </Pressable>
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
  headerSub: { fontSize: 8, letterSpacing: 0.8 },
  scroll: { paddingHorizontal: 20, paddingBottom: 40 },
  skeletons: { gap: 12 },
  list: { gap: 10 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#FFFFFF',
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 14,
  },
  rowInfo: { flex: 1, gap: 4 },
  rowMeta: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  rowMetaText: { fontSize: 9, letterSpacing: 0.4 },
  empty: { padding: 8 },
  retry: { marginTop: 12 },
  resultsCard: { paddingHorizontal: 14 },
});
