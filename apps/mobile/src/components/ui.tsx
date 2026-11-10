import { LinearGradient } from 'expo-linear-gradient';
import type { ReactElement, ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type DimensionValue,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, fonts, radii, shadow } from '@/lib/theme';

type TextVariant = 'display' | 'title' | 'h2' | 'h3' | 'body' | 'small' | 'caption' | 'label';

const textStyles: Record<TextVariant, TextStyle> = {
  display: { fontFamily: fonts.display, fontSize: 46, lineHeight: 48, letterSpacing: -0.4 },
  title: { fontFamily: fonts.display, fontSize: 34, lineHeight: 37, letterSpacing: -0.2 },
  h2: { fontFamily: fonts.display, fontSize: 26, lineHeight: 29 },
  h3: { fontFamily: fonts.display, fontSize: 21, lineHeight: 24 },
  body: { fontFamily: fonts.body, fontSize: 15, lineHeight: 23 },
  small: { fontFamily: fonts.body, fontSize: 13, lineHeight: 19 },
  caption: { fontFamily: fonts.medium, fontSize: 11, lineHeight: 15, letterSpacing: 0.7 },
  label: { fontFamily: fonts.bold, fontSize: 12, lineHeight: 16, letterSpacing: 0.4 },
};

export function AppText({
  children,
  variant = 'body',
  color = colors.text,
  style,
  numberOfLines,
}: {
  children: ReactNode;
  variant?: TextVariant;
  color?: string;
  style?: StyleProp<TextStyle>;
  numberOfLines?: number;
}) {
  return (
    <Text style={[textStyles[variant], { color }, style]} numberOfLines={numberOfLines}>
      {children}
    </Text>
  );
}

export function Screen({
  children,
  dark = false,
  style,
}: {
  children: ReactNode;
  dark?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <SafeAreaView style={[styles.screen, dark && { backgroundColor: colors.night }, style]} edges={['top']}>
      {children}
    </SafeAreaView>
  );
}

export function PageScroll({
  children,
  contentStyle,
  bottom = 120,
  refreshControl,
}: {
  children: ReactNode;
  contentStyle?: StyleProp<ViewStyle>;
  bottom?: number;
  refreshControl?: ReactElement;
}) {
  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      refreshControl={refreshControl}
      contentContainerStyle={[{ paddingBottom: bottom }, contentStyle]}>
      {children}
    </ScrollView>
  );
}

export function PrimaryButton({
  label,
  onPress,
  disabled,
  loading,
  icon,
  tone = 'primary',
  style,
}: {
  label: string;
  onPress?: () => void;
  disabled?: boolean;
  loading?: boolean;
  icon?: ReactNode;
  tone?: 'primary' | 'gold' | 'dark';
  style?: StyleProp<ViewStyle>;
}) {
  const backgrounds = {
    primary: colors.primary,
    gold: colors.accent,
    dark: colors.ink,
  };
  const textColor = tone === 'gold' ? colors.ink : '#FFFFFF';
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: backgrounds[tone] },
        (disabled || loading) && { opacity: 0.55 },
        pressed && { transform: [{ scale: 0.985 }] },
        style,
      ]}>
      {loading ? (
        <ActivityIndicator color={textColor} />
      ) : (
        <View style={styles.buttonInner}>
          <Text style={[styles.buttonText, { color: textColor }]}>{label}</Text>
          {icon}
        </View>
      )}
    </Pressable>
  );
}

export function GhostButton({
  label,
  onPress,
  icon,
  style,
}: {
  label: string;
  onPress?: () => void;
  icon?: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.ghostButton, pressed && { opacity: 0.7 }, style]}>
      {icon}
      <Text style={styles.ghostText}>{label}</Text>
    </Pressable>
  );
}

export function Pill({
  label,
  tone = 'green',
  style,
}: {
  label: string;
  tone?: 'green' | 'gold' | 'dark' | 'muted' | 'red';
  style?: StyleProp<ViewStyle>;
}) {
  const map = {
    green: { bg: colors.softGreen, text: colors.primary },
    gold: { bg: colors.softGold, text: colors.goldInk },
    dark: { bg: 'rgba(255,255,255,0.12)', text: '#FFFFFF' },
    muted: { bg: colors.surfaceAlt, text: colors.muted },
    red: { bg: '#FEE2E2', text: colors.danger },
  }[tone];
  return (
    <View style={[styles.pill, { backgroundColor: map.bg }, style]}>
      <Text style={[styles.pillText, { color: map.text }]}>{label}</Text>
    </View>
  );
}

export function SectionHeading({
  title,
  action,
  onAction,
  dark = false,
}: {
  title: string;
  action?: string;
  onAction?: () => void;
  dark?: boolean;
}) {
  return (
    <View style={styles.sectionRow}>
      <AppText variant="h2" color={dark ? '#FFFFFF' : colors.text}>
        {title}
      </AppText>
      {action ? (
        <Pressable onPress={onAction} style={styles.sectionAction}>
          <Text style={styles.sectionActionText}>{action}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/** Default crest gradient — brand primary pair. */
const defaultCrestColors: [string, string] = [colors.primary, colors.primaryDark];

export function Crest({
  short,
  size = 52,
  colors: crestColors = defaultCrestColors,
}: {
  short: string;
  size?: number;
  colors?: [string, string];
}) {
  return (
    <LinearGradient
      colors={crestColors}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[
        styles.crest,
        { width: size, height: size, borderRadius: size / 2.6, borderColor: 'rgba(255,255,255,0.22)' },
      ]}>
      <Text style={[styles.crestText, { fontSize: size * 0.32 }]}>{short}</Text>
    </LinearGradient>
  );
}

export function Card({
  children,
  style,
  dark = false,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  dark?: boolean;
}) {
  return (
    <View
      style={[
        styles.card,
        dark && { backgroundColor: colors.nightCard, borderColor: colors.nightBorder },
        style,
      ]}>
      {children}
    </View>
  );
}

export function Divider({ dashed = false, color = colors.line }: { dashed?: boolean; color?: string }) {
  return (
    <View
      style={{
        borderTopWidth: 1,
        borderStyle: dashed ? 'dashed' : 'solid',
        borderColor: color,
      }}
    />
  );
}

export function ScreenHeader({
  title,
  subtitle,
  onBack,
  right,
  dark = false,
}: {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  right?: ReactNode;
  dark?: boolean;
}) {
  return (
    <View style={styles.header}>
      {onBack ? (
        <Pressable onPress={onBack} style={styles.backButton}>
          <Text style={[styles.backText, { color: dark ? '#FFFFFF' : colors.text }]}>‹</Text>
        </Pressable>
      ) : (
        <View style={{ width: 40 }} />
      )}
      <View style={styles.headerCenter}>
        <AppText variant="h3" color={dark ? '#FFFFFF' : colors.text}>
          {title}
        </AppText>
        {subtitle ? (
          <AppText variant="caption" color={dark ? colors.nightMuted : colors.muted}>
            {subtitle.toUpperCase()}
          </AppText>
        ) : null}
      </View>
      <View style={styles.headerRight}>{right}</View>
    </View>
  );
}

export function LiveTag({ dark = false }: { dark?: boolean }) {
  return (
    <View style={[styles.liveTag, dark && { backgroundColor: 'rgba(255,255,255,0.12)' }]}>
      <View style={styles.liveDot} />
      <Text style={[styles.liveText, dark && { color: '#FFFFFF' }]}>LIVE</Text>
    </View>
  );
}

/** Neutral placeholder block used while a query is loading. */
export function Skeleton({
  height = 16,
  width = '100%' as DimensionValue,
  radius = 10,
  style,
}: {
  height?: number;
  width?: DimensionValue;
  radius?: number;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View
      style={[
        { height, width, borderRadius: radius, backgroundColor: colors.surfaceAlt },
        style,
      ]}
    />
  );
}

export function EmptyState({
  title,
  description,
  icon,
}: {
  title: string;
  description?: string;
  icon?: ReactNode;
}) {
  return (
    <View style={styles.emptyState}>
      {icon ? <View style={styles.emptyIcon}>{icon}</View> : null}
      <AppText variant="h3" style={styles.emptyTitle}>
        {title}
      </AppText>
      {description ? (
        <AppText variant="small" color={colors.muted} style={styles.emptyDescription}>
          {description}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  button: {
    minHeight: 54,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  buttonInner: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  buttonText: { fontFamily: fonts.bold, fontSize: 15, letterSpacing: 0.2 },
  ghostButton: {
    minHeight: 46,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
    flexDirection: 'row',
    gap: 8,
    backgroundColor: '#FFFFFF',
  },
  ghostText: { fontFamily: fonts.medium, fontSize: 14, color: colors.text },
  pill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radii.pill,
    alignSelf: 'flex-start',
  },
  pillText: { fontFamily: fonts.bold, fontSize: 10, letterSpacing: 0.5 },
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  sectionAction: { paddingVertical: 4 },
  sectionActionText: { fontFamily: fonts.bold, fontSize: 12, color: colors.primary },
  crest: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  crestText: { fontFamily: fonts.display, color: '#FFFFFF', letterSpacing: 0.5 },
  card: {
    backgroundColor: colors.card,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.line,
    ...shadow,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.7)',
  },
  backText: { fontSize: 34, lineHeight: 36, marginTop: -4, fontFamily: fonts.body },
  headerCenter: { flex: 1, alignItems: 'center', gap: 2 },
  headerRight: { width: 40, alignItems: 'flex-end' },
  liveTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    alignSelf: 'flex-start',
    backgroundColor: colors.softGreen,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radii.pill,
  },
  liveDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: colors.primary },
  liveText: {
    fontFamily: fonts.bold,
    fontSize: 8,
    letterSpacing: 1,
    color: colors.primary,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 36,
    paddingHorizontal: 24,
    gap: 6,
  },
  emptyIcon: {
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.softGreen,
    marginBottom: 6,
  },
  emptyTitle: { textAlign: 'center' },
  emptyDescription: { textAlign: 'center', maxWidth: 280 },
});
