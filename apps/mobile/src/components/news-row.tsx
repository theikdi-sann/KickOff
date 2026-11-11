import { LinearGradient } from 'expo-linear-gradient';
import { ChevronRight } from 'lucide-react-native';
import { Pressable, StyleSheet, View } from 'react-native';
import { formatMatchDate, type NewsDto } from '@kickoff/shared';
import { AppText } from '@/components/ui';
import { colors } from '@/lib/theme';

/** Compact article row used by the home feed and the full news list. */
export function NewsRow({
  item,
  last,
  onPress,
}: {
  item: NewsDto;
  last: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.newsRow,
        last && { borderBottomWidth: 0 },
        pressed && { opacity: 0.7 },
      ]}>
      <LinearGradient colors={item.imageColors} style={styles.newsThumb}>
        <AppText variant="caption" color="rgba(255,255,255,0.8)" style={styles.thumbText}>
          {item.category === 'Match Report' ? 'FT' : 'KO'}
        </AppText>
      </LinearGradient>
      <View style={styles.newsInfo}>
        <AppText variant="caption" color={colors.primary} style={styles.newsCategory}>
          {item.category.toUpperCase()}
        </AppText>
        <AppText variant="label" numberOfLines={2} style={styles.newsTitle}>
          {item.title}
        </AppText>
        <AppText variant="caption" color={colors.muted} style={styles.newsMetaText}>
          {formatMatchDate(item.publishedAt).toUpperCase()} · {item.readMinutes} MIN
        </AppText>
      </View>
      <ChevronRight size={17} color={colors.muted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  newsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  newsThumb: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbText: { fontSize: 10, letterSpacing: 0.8 },
  newsInfo: { flex: 1, gap: 2 },
  newsCategory: { fontSize: 8, letterSpacing: 0.8 },
  newsTitle: { fontSize: 12, lineHeight: 17 },
  newsMetaText: { fontSize: 9, letterSpacing: 0.35 },
});
