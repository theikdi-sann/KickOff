import { useLocalSearchParams, useRouter } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';
import { AppText, Card, Screen, ScreenHeader } from '@/components/ui';
import { colors } from '@/lib/theme';

interface LegalDoc {
  title: string;
  updated: string;
  intro: string;
  sections: { heading: string; body: string }[];
}

const DOCS: Record<string, LegalDoc> = {
  terms: {
    title: 'Terms of use',
    updated: 'November 2026',
    intro:
      'These terms cover your use of the XClub member app, match passes, and the club’s gate validation service.',
    sections: [
      {
        heading: 'Match passes',
        body: 'A pass admits one person to the named fixture and is valid only for the seat shown. Passes are personal to the signed-in account. The club may ask for photo ID at the gate.',
      },
      {
        heading: 'Gate validation',
        body: 'Every pass carries a signed QR code that is checked live by club staff. A pass that has already been scanned, belongs to another fixture, or fails validation will be refused.',
      },
      {
        heading: 'Account security',
        body: 'You are responsible for keeping your sign-in details secure. Tell the club immediately if you believe someone else has access to your account.',
      },
      {
        heading: 'Changes',
        body: 'The club may update these terms for future fixtures. The version shown here applies when you purchase a pass.',
      },
    ],
  },
  privacy: {
    title: 'Privacy policy',
    updated: 'November 2026',
    intro:
      'XClub collects only the information needed to run your account, sell passes, and keep the stadium safe.',
    sections: [
      {
        heading: 'What we collect',
        body: 'Your name, email, phone number, order history, seat allocations, and device push tokens. Card details are handled by Stripe and never stored by XClub.',
      },
      {
        heading: 'How we use it',
        body: 'To issue passes, process payments, send match reminders you opt into, prevent fraud, and meet stadium safety requirements.',
      },
      {
        heading: 'Who we share it with',
        body: 'Stripe for payment processing, Supabase for secure hosting, and Expo for push delivery. We do not sell personal data.',
      },
      {
        heading: 'Your choices',
        body: 'You can turn off reminders in Settings, update your details, or delete your account. Deletion voids unused passes and removes personal details from active records.',
      },
    ],
  },
  refund: {
    title: 'Refund policy',
    updated: 'November 2026',
    intro:
      'Single-match passes are non-refundable, in line with the club’s ticketing policy for the 2026/27 season.',
    sections: [
      {
        heading: 'Non-refundable passes',
        body: 'Once payment is confirmed, a pass cannot be refunded simply because you can no longer attend. You may transfer the pass only through the club.',
      },
      {
        heading: 'Club-initiated changes',
        body: 'If the club cancels or rearranges a fixture, the club will contact affected supporters with the available options, which may include a refund.',
      },
      {
        heading: 'Exceptional cases',
        body: 'An admin may issue a refund for an audited exceptional case, such as duplicate payment or a payment error. Refunds return to the original card.',
      },
      {
        heading: 'Questions',
        body: 'Contact supporter services with your order reference if you believe a refund is due.',
      },
    ],
  },
};

export default function LegalScreen() {
  const router = useRouter();
  const { doc } = useLocalSearchParams<{ doc: string }>();
  const selected = DOCS[doc ?? ''] ?? DOCS.terms!;

  return (
    <Screen>
      <ScreenHeader title={selected.title} subtitle={`Updated ${selected.updated}`} onBack={() => router.back()} />
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Card style={styles.card}>
          <AppText variant="body" color={colors.muted} style={styles.intro}>
            {selected.intro}
          </AppText>
          {selected.sections.map((section) => (
            <View key={section.heading} style={styles.section}>
              <AppText variant="h3" style={styles.heading}>
                {section.heading}
              </AppText>
              <AppText variant="small" color={colors.muted} style={styles.body}>
                {section.body}
              </AppText>
            </View>
          ))}
        </Card>
        <AppText variant="caption" color={colors.muted} style={styles.footer}>
          XCLUB ARENA · BANGKOK · THAILAND
        </AppText>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingHorizontal: 20, paddingBottom: 48 },
  card: { padding: 18 },
  intro: { lineHeight: 22 },
  section: { marginTop: 20 },
  heading: { fontSize: 18, lineHeight: 21 },
  body: { marginTop: 6, lineHeight: 19 },
  footer: { textAlign: 'center', fontSize: 8, letterSpacing: 0.8, marginTop: 22 },
});
