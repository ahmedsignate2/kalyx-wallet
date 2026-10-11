import { NovaHero } from '../ui/nova';
import { ScreenHeader, Card, Screen } from '../ui/kit';
import { Text, ScrollView } from 'react-native';
import { Stack } from 'expo-router';
import { spacing, useTheme, fonts, fontSize } from '../ui/theme';
import { useT } from '../lib/settingsStore';
import { REOWN_NOTICE, WALLETCONNECT_LICENSE_TEXT } from '../src/constants/thirdPartyLicenses';

export default function Licenses() {
  const { colors, typography } = useTheme();
  const t = useT();

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <Screen>
      <ScreenHeader />
      <NovaHero icon="about" title={t('thirdPartyLicenses')} subtitle={t('thirdPartyLicensesIntro')} />
      <ScrollView contentContainerStyle={{ gap: spacing(1.5), paddingBottom: spacing(4) }} showsVerticalScrollIndicator={false}>
        <Card rise delay={50} style={{ gap: spacing(0.75) }}>
          <Text style={typography.bodyStrong}>WalletConnect · WalletKit</Text>
          <Text style={[typography.muted, { fontSize: fontSize.md }]}>{REOWN_NOTICE}</Text>
        </Card>
        <Card rise delay={100} style={{ gap: spacing(0.75) }}>
          <Text selectable style={[typography.muted, { color: colors.textSecondary, fontSize: fontSize.xs, lineHeight: 18, fontFamily: fonts.regular }]}>
            {WALLETCONNECT_LICENSE_TEXT}
          </Text>
        </Card>
      </ScrollView>
    </Screen>
    </>
  );
}
