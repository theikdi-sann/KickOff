import { LinearGradient } from 'expo-linear-gradient';
import { ChevronLeft, Clock3, Share2 } from 'lucide-react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Pressable, ScrollView, Share, StyleSheet, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { formatFullDate, mockNews } from '@xclub/shared';
import { AppText, Card, Pill, Screen } from '@/components/ui';
import { colors, radii, shadow } from '@/lib/theme';

export default function NewsDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const item = mockNews.find((article) => article.id === id) ?? mockNews[0];
  const related = mockNews.filter((article) => article.id !== item.id).slice(0, 2);
  const paragraphs = item.body.split('\n\n');

  const shareArticle = async () => {
    await Share.share({
      message: `${item.title}\n\n${item.excerpt}\n\nRead more in the XClub app.`,
    }).catch(() => undefined);
  };

  return (
    <Screen>
      <StatusBar style="light" />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        <LinearGradient
          colors={item.imageColors}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.hero}>
          <View style={styles.heroGlow} />
          <View style={styles.topRow}>
            <Pressable onPress={() => router.back()} style={styles.iconButton}>
              <ChevronLeft size={21} color="#FFFFFF" />
            </Pressable>
            <Pressable onPress={shareArticle} style={styles.iconButton}>
              <Share2 size={18} color="#FFFFFF" />
            </Pressable>
          </View>
          <View style={styles.heroMark}>
            <AppText variant="display" color="rgba(255,255,255,0.12)" style={styles.heroMarkText}>
              XC
            </AppText>
          </View>
          <View style={styles.heroBottom}>
            <Pill label={item.category.toUpperCase()} tone="dark" />
            <AppText variant="caption" color="rgba(255,255,255,0.65)" style={styles.heroMeta}>
              {formatFullDate(item.publishedAt).toUpperCase()}
            </AppText>
          </View>
        </LinearGradient>

        <View style={styles.article}>
          <Card style={styles.titleCard}>
            <AppText variant="title" style={styles.title}>
              {item.title}
            </AppText>
            <AppText variant="body" color={colors.muted} style={styles.excerpt}>
              {item.excerpt}
            </AppText>
            <View style={styles.byline}>
              <View style={styles.avatar}>
                <AppText variant="caption" color="#FFFFFF">
                  XC
                </AppText>
              </View>
              <View style={styles.flex}>
                <AppText variant="label">XClub Media</AppText>
                <View style={styles.readRow}>
                  <Clock3 size={11} color={colors.muted} />
                  <AppText variant="caption" color={colors.muted} style={styles.readText}>
                    {item.readMinutes} MIN READ
                  </AppText>
                </View>
              </View>
              <Pill label="CLUB FEED" tone="green" />
            </View>
          </Card>

          <View style={styles.body}>
            {paragraphs.map((paragraph, index) => (
              <AppText
                key={`${item.id}-p-${index}`}
                variant="body"
                color={colors.inkMuted}
                style={styles.paragraph}>
                {paragraph}
              </AppText>
            ))}
          </View>

          <View style={styles.quote}>
            <View style={styles.quoteBar} />
            <AppText variant="h3" color={colors.primary} style={styles.quoteText}>
              “Every match is better when the stands are full.”
            </AppText>
            <AppText variant="caption" color={colors.muted} style={styles.quoteBy}>
              XCLUB SUPPORTERS TRUST
            </AppText>
          </View>

          <View style={styles.divider} />

          <AppText variant="h2" style={styles.moreTitle}>
            More from the club
          </AppText>
          <View style={styles.related}>
            {related.map((article) => (
              <Pressable
                key={article.id}
                onPress={() => router.replace({ pathname: '/news/[id]', params: { id: article.id } })}
                style={({ pressed }) => [styles.relatedRow, pressed && { opacity: 0.7 }]}>
                <LinearGradient colors={article.imageColors} style={styles.relatedThumb}>
                  <AppText variant="caption" color="rgba(255,255,255,0.8)" style={styles.relatedThumbText}>
                    {article.category === 'Match Report' ? 'FT' : 'XC'}
                  </AppText>
                </LinearGradient>
                <View style={styles.flex}>
                  <AppText variant="caption" color={colors.primary} style={styles.relatedCategory}>
                    {article.category.toUpperCase()}
                  </AppText>
                  <AppText variant="label" numberOfLines={2}>
                    {article.title}
                  </AppText>
                </View>
              </Pressable>
            ))}
          </View>

          <Pressable onPress={() => router.replace('/')} style={styles.backHome}>
            <AppText variant="label" color={colors.primary}>
              Back to home
            </AppText>
          </Pressable>
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingBottom: 40 },
  hero: {
    height: 270,
    paddingHorizontal: 20,
    paddingTop: 8,
    borderBottomLeftRadius: 30,
    borderBottomRightRadius: 30,
    overflow: 'hidden',
    justifyContent: 'space-between',
  },
  heroGlow: {
    position: 'absolute',
    width: 240,
    height: 240,
    borderRadius: 120,
    backgroundColor: 'rgba(255,255,255,0.06)',
    right: -90,
    top: -80,
  },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroMark: { position: 'absolute', right: 20, bottom: 34 },
  heroMarkText: { fontSize: 120, lineHeight: 124, letterSpacing: 2 },
  heroBottom: { paddingBottom: 22, gap: 8, alignItems: 'flex-start' },
  heroMeta: { fontSize: 8, letterSpacing: 0.8 },
  article: { paddingHorizontal: 20 },
  titleCard: { marginTop: -22, padding: 18 },
  title: { fontSize: 30, lineHeight: 33 },
  excerpt: { marginTop: 10, fontSize: 14, lineHeight: 22 },
  byline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 16,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  flex: { flex: 1 },
  readRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 1 },
  readText: { fontSize: 8, letterSpacing: 0.5 },
  body: { marginTop: 24, gap: 16 },
  paragraph: { fontSize: 15, lineHeight: 25 },
  quote: {
    marginTop: 26,
    backgroundColor: colors.softGreen,
    borderRadius: radii.lg,
    padding: 18,
    flexDirection: 'column',
    gap: 6,
  },
  quoteBar: { width: 34, height: 3, borderRadius: 2, backgroundColor: colors.primary, marginBottom: 4 },
  quoteText: { fontSize: 21, lineHeight: 26 },
  quoteBy: { fontSize: 8, letterSpacing: 0.8 },
  divider: { height: 1, backgroundColor: colors.line, marginVertical: 26 },
  moreTitle: { marginBottom: 12 },
  related: { gap: 10 },
  relatedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    backgroundColor: '#FFFFFF',
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 10,
    ...shadow,
  },
  relatedThumb: { width: 52, height: 52, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  relatedThumbText: { fontSize: 9, letterSpacing: 0.7 },
  relatedCategory: { fontSize: 8, letterSpacing: 0.7, marginBottom: 2 },
  backHome: { alignItems: 'center', marginTop: 24, paddingVertical: 8 },
});
