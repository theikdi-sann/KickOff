import { LinearGradient } from 'expo-linear-gradient';
import {
  Bell,
  ChevronRight,
  CreditCard,
  HelpCircle,
  LogOut,
  ReceiptText,
  ShieldCheck,
  Ticket as TicketIcon,
  UserRound,
} from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import { formatTHB, formatShortDate } from '@xclub/shared';
import { AppText, Card, MockTag, PageScroll, Pill, Screen } from '@/components/ui';
import { useApp } from '@/lib/store';
import { colors, fonts, radii } from '@/lib/theme';

export default function ProfileScreen() {
  const router = useRouter();
  const { profile, tickets, orders, signOut } = useApp();
  const active = tickets.filter((ticket) => ticket.status === 'valid').length;
  const spent = orders
    .filter((order) => order.status === 'paid')
    .reduce((sum, order) => sum + order.amountSatang, 0);

  const confirmSignOut = () => {
    Alert.alert('Sign out?', 'Your mock tickets will stay on this device.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: () => signOut() },
    ]);
  };

  return (
    <Screen>
      <PageScroll bottom={118}>
        <LinearGradient colors={['#0B6B3A', '#064E2B', '#07130D']} style={styles.hero}>
          <View style={styles.heroTop}>
            <AppText variant="caption" color="rgba(255,255,255,0.6)" style={styles.heroEyebrow}>
              SUPPORTER ACCOUNT
            </AppText>
            <MockTag dark />
          </View>
          <View style={styles.identity}>
            <View style={styles.avatar}>
              <AppText variant="display" color="#FFFFFF" style={styles.initials}>
                {profile?.initials ?? 'NC'}
              </AppText>
            </View>
            <View style={styles.flex}>
              <AppText variant="h2" color="#FFFFFF">
                {profile?.fullName ?? 'Nara Chaiyaporn'}
              </AppText>
              <AppText variant="small" color={colors.nightMuted}>
                {profile?.email ?? 'fan@xclub.app'}
              </AppText>
              <View style={styles.verified}>
                <ShieldCheck size={12} color={colors.accent} />
                <AppText variant="caption" color={colors.accent} style={styles.verifiedText}>
                  VERIFIED MEMBER
                </AppText>
              </View>
            </View>
          </View>
          <View style={styles.heroStats}>
            <HeroStat value={String(active)} label="ACTIVE PASSES" />
            <View style={styles.heroDivider} />
            <HeroStat value={String(orders.length)} label="ORDERS" />
            <View style={styles.heroDivider} />
            <HeroStat value={formatTHB(spent)} label="SPENT" />
          </View>
        </LinearGradient>

        <View style={styles.body}>
          <Card style={styles.memberCard}>
            <View style={styles.memberRow}>
              <View style={styles.memberIcon}>
                <TicketIcon size={18} color={colors.primary} />
              </View>
              <View style={styles.flex}>
                <AppText variant="label">Supporter since</AppText>
                <AppText variant="small" color={colors.muted}>
                  {formatShortDate(profile?.joinedAt ?? '2026-08-12T09:00:00+07:00')}
                </AppText>
              </View>
              <Pill label="2026/27" tone="gold" />
            </View>
          </Card>

          <AppText variant="caption" color={colors.muted} style={styles.sectionLabel}>
            ACCOUNT
          </AppText>
          <Card style={styles.menu}>
            <MenuItem
              icon={<UserRound size={18} color={colors.primary} />}
              label="Personal details"
              detail={profile?.phone ?? '080 000 0000'}
              onPress={() => Alert.alert('Mock screen', 'Profile editing arrives with the Supabase phase.')}
            />
            <MenuItem
              icon={<ReceiptText size={18} color={colors.primary} />}
              label="Orders & receipts"
              detail={`${orders.length} orders`}
              onPress={() => router.push('/orders')}
            />
            <MenuItem
              icon={<CreditCard size={18} color={colors.primary} />}
              label="Payment methods"
              detail="Visa •••• 4242"
              onPress={() => Alert.alert('Stripe test mode', 'Real card management is part of Phase C.')}
            />
            <MenuItem
              icon={<Bell size={18} color={colors.primary} />}
              label="Notifications"
              detail="Match reminders"
              onPress={() => Alert.alert('Post-MVP', 'Push notifications are outside the prototype scope.')}
              last
            />
          </Card>

          <AppText variant="caption" color={colors.muted} style={styles.sectionLabel}>
            SUPPORT
          </AppText>
          <Card style={styles.menu}>
            <MenuItem
              icon={<HelpCircle size={18} color={colors.primary} />}
              label="Help & stadium info"
              detail="Gates, travel, rules"
              onPress={() => Alert.alert('XClub Arena', 'Gates open 2 hours before kick-off. Gate 2 for North Stand.')}
            />
            <MenuItem
              icon={<ShieldCheck size={18} color={colors.primary} />}
              label="Ticket terms"
              detail="Single-match passes"
              onPress={() => Alert.alert('Ticket terms', 'Mock terms for the prototype.')}
              last
            />
          </Card>

          <View style={styles.mockCard}>
            <View style={styles.mockHeader}>
              <View style={styles.mockDot} />
              <AppText variant="label" color="#8A6400">
                Prototype data layer
              </AppText>
            </View>
            <AppText variant="small" color="#8A6400" style={styles.mockText}>
              Auth, payments, tickets, and gate validation are simulated locally. Supabase and Stripe
              test mode replace this layer in Phase B/C.
            </AppText>
          </View>

          <Pressable onPress={confirmSignOut} style={styles.signOut}>
            <LogOut size={16} color={colors.danger} />
            <AppText variant="label" color={colors.danger}>
              Sign out
            </AppText>
          </Pressable>

          <AppText variant="caption" color={colors.muted} style={styles.version}>
            XCLUB MOCK BUILD · v0.1.0
          </AppText>
        </View>
      </PageScroll>
    </Screen>
  );
}

function HeroStat({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.heroStat}>
      <AppText variant="h3" color="#FFFFFF" style={styles.heroStatValue}>
        {value}
      </AppText>
      <AppText variant="caption" color="rgba(255,255,255,0.5)" style={styles.heroStatLabel}>
        {label}
      </AppText>
    </View>
  );
}

function MenuItem({
  icon,
  label,
  detail,
  onPress,
  last,
}: {
  icon: React.ReactNode;
  label: string;
  detail: string;
  onPress: () => void;
  last?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.menuItem, last && { borderBottomWidth: 0 }, pressed && { opacity: 0.65 }]}>
      <View style={styles.menuIcon}>{icon}</View>
      <View style={styles.flex}>
        <AppText variant="label">{label}</AppText>
        <AppText variant="small" color={colors.muted} style={styles.menuDetail}>
          {detail}
        </AppText>
      </View>
      <ChevronRight size={17} color={colors.muted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  hero: {
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 26,
    borderBottomLeftRadius: 30,
    borderBottomRightRadius: 30,
  },
  heroTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  heroEyebrow: { fontSize: 9, letterSpacing: 1.1 },
  identity: { flexDirection: 'row', alignItems: 'center', gap: 15, marginTop: 24 },
  avatar: {
    width: 76,
    height: 76,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  initials: { fontSize: 34, lineHeight: 38 },
  flex: { flex: 1 },
  verified: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 7 },
  verifiedText: { fontSize: 8, letterSpacing: 0.8 },
  heroStats: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: radii.md,
    paddingVertical: 12,
    marginTop: 22,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  heroStat: { flex: 1, alignItems: 'center' },
  heroStatValue: { fontSize: 20, lineHeight: 23 },
  heroStatLabel: { fontSize: 7, letterSpacing: 0.7, marginTop: 2 },
  heroDivider: { width: 1, height: 24, backgroundColor: 'rgba(255,255,255,0.14)' },
  body: { paddingHorizontal: 20, paddingTop: 18 },
  memberCard: { padding: 14 },
  memberRow: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  memberIcon: {
    width: 42,
    height: 42,
    borderRadius: 13,
    backgroundColor: colors.softGreen,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionLabel: { fontSize: 9, letterSpacing: 1, marginTop: 24, marginBottom: 9, marginLeft: 2 },
  menu: { paddingHorizontal: 14 },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    paddingVertical: 13,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  menuIcon: {
    width: 36,
    height: 36,
    borderRadius: 11,
    backgroundColor: colors.softGreen,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuDetail: { fontSize: 11, marginTop: 1 },
  mockCard: {
    marginTop: 22,
    backgroundColor: colors.softGold,
    borderWidth: 1,
    borderColor: '#F3E3A7',
    borderRadius: radii.lg,
    padding: 15,
  },
  mockHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 5 },
  mockDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.warning },
  mockText: { fontSize: 11, lineHeight: 16 },
  signOut: {
    marginTop: 24,
    minHeight: 50,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: '#FECACA',
    backgroundColor: '#FFF5F5',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  version: { textAlign: 'center', fontSize: 8, letterSpacing: 0.8, marginTop: 18 },
  font: { fontFamily: fonts.bold },
});
