import { LinearGradient } from 'expo-linear-gradient';
import { ArrowRight, CalendarDays, QrCode, ShieldCheck, Sparkles } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { CLUB_TAGLINE } from '@xclub/shared';
import { AppText, LiveTag, PrimaryButton } from '@/components/ui';
import { colors, radii, shadow } from '@/lib/theme';

export default function WelcomeScreen() {
  const router = useRouter();

  return (
    <LinearGradient colors={['#07130D', '#0A2B1B', '#07130D']} locations={[0, 0.55, 1]} style={styles.flex}>
      <StatusBar style="light" />
      <View style={styles.pitchLineOne} />
      <View style={styles.pitchLineTwo} />
      <View style={styles.circle} />
      <SafeAreaView style={styles.flex}>
        <View style={styles.header}>
          <View style={styles.brandRow}>
            <View style={styles.logo}>
              <AppText variant="h2" color={colors.night}>
                X
              </AppText>
            </View>
            <View>
              <AppText variant="h2" color="#FFFFFF" style={styles.brand}>
                XCLUB
              </AppText>
              <AppText variant="caption" color={colors.nightMuted} style={styles.est}>
                EST. 2026 · BANGKOK
              </AppText>
            </View>
          </View>
          <LiveTag dark />
        </View>

        <View style={styles.hero}>
          <View style={styles.eyebrow}>
            <Sparkles size={12} color={colors.accent} />
            <AppText variant="caption" color={colors.accent}>
              THE 2026/27 SEASON
            </AppText>
          </View>
          <AppText variant="display" color="#FFFFFF" style={styles.headline}>
            MATCH DAY{'\n'}STARTS HERE.
          </AppText>
          <AppText variant="body" color={colors.nightMuted} style={styles.sub}>
            {CLUB_TAGLINE} Pick your exact seat, pay securely, and carry your pass in your pocket.
          </AppText>

          <View style={styles.pass}>
            <LinearGradient
              colors={['rgba(22,163,74,0.3)', 'rgba(7,19,13,0.1)']}
              style={StyleSheet.absoluteFill}
            />
            <View style={styles.passTop}>
              <View>
                <AppText variant="caption" color={colors.nightMuted}>
                  DIGITAL MATCH PASS
                </AppText>
                <AppText variant="h3" color="#FFFFFF" style={styles.passTitle}>
                  XClub vs Bangkok Rovers
                </AppText>
              </View>
              <View style={styles.qrBox}>
                <QrCode size={30} color={colors.primaryDark} />
              </View>
            </View>
            <View style={styles.passDivider} />
            <View style={styles.passBottom}>
              <PassStat label="STAND" value="North" />
              <PassStat label="ROW" value="C" />
              <PassStat label="SEAT" value="07" />
              <View style={styles.passCheck}>
                <ShieldCheck size={15} color={colors.accent} />
                <AppText variant="caption" color={colors.accent} style={styles.passCheckText}>
                  VERIFIED
                </AppText>
              </View>
            </View>
          </View>

          <View style={styles.features}>
            <Feature icon={<CalendarDays size={14} color={colors.accent} />} label="Fixtures & news" />
            <Feature icon={<QrCode size={14} color={colors.accent} />} label="Offline QR pass" />
            <Feature icon={<ShieldCheck size={14} color={colors.accent} />} label="Secure entry" />
          </View>
        </View>

        <View style={styles.footer}>
          <PrimaryButton
            label="Get started"
            tone="gold"
            onPress={() => router.push('/login')}
            icon={<ArrowRight size={18} color={colors.ink} />}
          />
          <Pressable onPress={() => router.push('/register')} style={styles.secondary}>
            <AppText variant="small" color={colors.nightMuted}>
              New here?{' '}
              <AppText variant="label" color="#FFFFFF">
                Create an account
              </AppText>
            </AppText>
          </Pressable>
        </View>
      </SafeAreaView>
    </LinearGradient>
  );
}

function PassStat({ label, value }: { label: string; value: string }) {
  return (
    <View>
      <AppText variant="caption" color={colors.nightMuted} style={styles.passLabel}>
        {label}
      </AppText>
      <AppText variant="label" color="#FFFFFF">
        {value}
      </AppText>
    </View>
  );
}

function Feature({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <View style={styles.feature}>
      {icon}
      <AppText variant="caption" color={colors.nightMuted} style={styles.featureText}>
        {label}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  pitchLineOne: {
    position: 'absolute',
    width: 320,
    height: 320,
    borderRadius: 160,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    right: -130,
    top: 90,
  },
  pitchLineTwo: {
    position: 'absolute',
    width: 1,
    height: 260,
    backgroundColor: 'rgba(255,255,255,0.05)',
    left: 40,
    bottom: 0,
  },
  circle: {
    position: 'absolute',
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: 'rgba(22,163,74,0.09)',
    left: -70,
    top: 210,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingTop: 8,
  },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  logo: {
    width: 38,
    height: 38,
    borderRadius: 11,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brand: { letterSpacing: 1.6, lineHeight: 28 },
  est: { fontSize: 8, letterSpacing: 1.2 },
  hero: { flex: 1, paddingHorizontal: 24, justifyContent: 'center', paddingBottom: 12 },
  eyebrow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 },
  headline: { fontSize: 58, lineHeight: 56, letterSpacing: -0.5 },
  sub: { marginTop: 14, fontSize: 14, lineHeight: 22, maxWidth: 350 },
  pass: {
    marginTop: 26,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: 'rgba(244,196,48,0.22)',
    padding: 16,
    overflow: 'hidden',
    backgroundColor: 'rgba(16,35,26,0.72)',
    ...shadow,
  },
  passTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  passTitle: { marginTop: 3, fontSize: 19 },
  qrBox: {
    width: 52,
    height: 52,
    borderRadius: 12,
    backgroundColor: '#F8FAFC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  passDivider: {
    borderTopWidth: 1,
    borderStyle: 'dashed',
    borderColor: 'rgba(255,255,255,0.14)',
    marginVertical: 14,
  },
  passBottom: { flexDirection: 'row', alignItems: 'flex-end', gap: 24 },
  passLabel: { fontSize: 8, letterSpacing: 1 },
  passCheck: { flexDirection: 'row', alignItems: 'center', gap: 4, marginLeft: 'auto' },
  passCheckText: { fontSize: 8, letterSpacing: 0.8 },
  features: { flexDirection: 'row', gap: 10, marginTop: 18, flexWrap: 'wrap' },
  feature: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.06)',
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
  },
  featureText: { fontSize: 9, letterSpacing: 0.3 },
  footer: { paddingHorizontal: 24, paddingBottom: 14, gap: 12 },
  secondary: { alignItems: 'center', paddingVertical: 4 },
});
