import { ChevronLeft } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { NewsRow } from '@/components/news-row';
import { AppText, Card, EmptyState, Screen, Skeleton } from '@/components/ui';
import { useNews } from '@/lib/queries/news';
import { colors } from '@/lib/theme';

/**
 * Full news feed — the destination of the home feed's "See all".
 * Every published article, uncut (the home card only teases the first few).
 */
export default function NewsScreen() {
  const router = useRouter();
  const newsQuery = useNews();
  const news = newsQuery.data ?? [];

  const refresh = () => void newsQuery.refetch();

  return (
    <Screen>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.iconButton}>
          <ChevronLeft size={21} color={colors.text} />
        </Pressable>
        <View style={styles.headerCenter}>
          <AppText variant="h3">Club news</AppText>
          <AppText variant="caption" color={colors.muted} style={styles.headerSub}>
            {news.length} {news.length === 1 ? 'ARTICLE' : 'ARTICLES'}
          </AppText>
        </View>
        <View style={styles.spacer} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl
            refreshing={newsQuery.isRefetching}
            onRefresh={refresh}
            tintColor={colors.primary}
          />
        }>
        {newsQuery.isLoading ? (
          <View style={styles.skeletons}>
            <Skeleton height={88} radius={16} />
            <Skeleton height={88} radius={16} />
            <Skeleton height={88} radius={16} />
          </View>
        ) : news.length === 0 ? (
          <Card style={styles.empty}>
            <EmptyState title="No news yet" description="Club updates will land here." />
          </Card>
        ) : (
          <Card style={styles.list}>
            {news.map((item, index) => (
              <NewsRow
                key={item.id}
                item={item}
                last={index === news.length - 1}
                onPress={() => router.push({ pathname: '/news/[id]', params: { id: item.id } })}
              />
            ))}
          </Card>
        )}
      </ScrollView>
    </Screen>
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
  spacer: { width: 40 },
  scroll: { paddingHorizontal: 20, paddingBottom: 40 },
  skeletons: { gap: 12 },
  empty: { padding: 8 },
  list: { paddingHorizontal: 14 },
});
