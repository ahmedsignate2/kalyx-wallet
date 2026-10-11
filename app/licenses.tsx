import { NovaCard, NovaHero } from '../ui/nova';
import { ScreenHeader } from '../ui/kit';
import React from 'react';
import { Text, ScrollView } from 'react-native';
import { Stack } from 'expo-router';
import { PremiumScreen } from '../ui/premium';
import { spacing, useTheme, fonts } from '../ui/theme';
import { useT } from '../lib/settingsStore';
import { REOWN_NOTICE, WALLETCONNECT_LICENSE_TEXT } from '../src/constants/thirdPartyLicenses';

export default function Licenses() {
  const { colors, typography } = useTheme();
  const t = useT();

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <PremiumScreen>
      <ScreenHeader />
      <NovaHero icon="about" title={t('thirdPartyLicenses')} subtitle={t('thirdPartyLicensesIntro')} />
      <ScrollView contentContainerStyle={{ gap: spacing(1.5), paddingBottom: spacing(4) }} showsVerticalScrollIndicator={false}>
        <NovaCard delay={50} style={{ gap: spacing(0.75) }}>
          <Text style={typography.bodyStrong}>WalletConnect · WalletKit</Text>
          <Text style={[typography.muted, { fontSize: 14 }]}>{REOWN_NOTICE}</Text>
        </NovaCard>
        <NovaCard delay={100} style={{ gap: spacing(0.75) }}>
          <Text selectable style={[typography.muted, { color: colors.textSecondary, fontSize: 12, lineHeight: 18, fontFamily: fonts.regular }]}>
            {WALLETCONNECT_LICENSE_TEXT}
          </Text>
        </NovaCard>
      </ScrollView>
    </PremiumScreen>
    </>
  );
}
