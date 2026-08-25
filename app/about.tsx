import React from 'react';
import { View, Text, Pressable, Linking } from 'react-native';
import { Stack, router } from 'expo-router';
import Constants from 'expo-constants';
import { PremiumScreen, GlassCard, ListRow } from '../ui/premium';
import { Button } from '../ui/components';
import { NovaLogo } from '../ui/NovaLogo';
import { Icon } from '../ui/icon';
import { spacing, useTheme } from '../ui/theme';
import { toast } from '../lib/toast';
import { useT } from '../lib/settingsStore';

// Destinataire du support. Volontairement NON affiché à l'écran (le bouton
// ouvre l'app mail avec l'adresse pré-remplie, sans jamais la montrer).
const SUPPORT_EMAIL = 'amsssr400@gmail.com';

export default function About() {
  const { colors, typography } = useTheme();
  const t = useT();
  const version = Constants.expoConfig?.version ?? '0.0.1';

  const contact = () => {
    const subject = encodeURIComponent(t('supportEmailSubject'));
    const body = encodeURIComponent(`\n\n—\nNova Wallet v${version}`);
    Linking.openURL(`mailto:${SUPPORT_EMAIL}?subject=${subject}&body=${body}`).catch(() =>
      toast.error(t('cannotOpenMail')),
    );
  };

  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: t('about') }} />
      <PremiumScreen>

      {/* Identité */}
      <View style={{ alignItems: 'center', gap: spacing(1), paddingVertical: spacing(2) }}>
        <NovaLogo size={84} />
        <Text style={{ color: colors.text, fontSize: 26, fontFamily: 'Inter_800ExtraBold', letterSpacing: 0.5 }}>Nova Wallet</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text style={typography.muted}>{t('versionWord')} v{version}</Text>
          <View style={{ backgroundColor: colors.warning + '22', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 }}>
            <Text style={{ color: colors.warning, fontSize: 10, fontFamily: 'Inter_800ExtraBold', letterSpacing: 0.5 }}>{t('betaTag')}</Text>
          </View>
        </View>
      </View>

      <GlassCard>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: spacing(0.75) }}>
          <Text style={typography.muted}>{t('publisher')}</Text>
          <Text style={typography.bodyStrong}>Société Malin</Text>
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: spacing(0.75), borderTopWidth: 1, borderTopColor: colors.glassBorder }}>
          <Text style={typography.muted}>{t('typeLabel')}</Text>
          <Text style={typography.bodyStrong}>{t('propNonCustodial')}</Text>
        </View>
      </GlassCard>

      {/* Liens */}
      <GlassCard>
        <ListRow left={<Icon name="faq" size={20} color={colors.textMuted} />} title={t('faq')} right={<Icon name="chevron" size={18} tone="faint" />} onPress={() => router.push('/faq')} />
        <ListRow divider left={<Icon name="security" size={20} color={colors.textMuted} />} title={t('privacyPolicy')} right={<Icon name="chevron" size={18} tone="faint" />} onPress={() => router.push({ pathname: '/legal', params: { doc: 'privacy' } })} />
        <ListRow divider left={<Icon name="phrase" size={20} color={colors.textMuted} />} title={t('termsOfUse')} right={<Icon name="chevron" size={18} tone="faint" />} onPress={() => router.push({ pathname: '/legal', params: { doc: 'terms' } })} />
        <ListRow divider left={<Icon name="support" size={20} color={colors.textMuted} />} title={t('contactSupport')} subtitle={t('byEmail')} right={<Icon name="chevron" size={18} tone="faint" />} onPress={contact} />
      </GlassCard>

      <View style={{ flex: 1 }} />
      <Button label={t('contactSupport')} onPress={contact} />
      <Text style={[typography.muted, { textAlign: 'center', fontSize: 12, marginTop: spacing(1.5) }]}>
        © 2026 Malin. {t('allRightsReserved')}
      </Text>
      <View style={{ height: spacing(2) }} />
    </PremiumScreen>
    </>
  );
}
