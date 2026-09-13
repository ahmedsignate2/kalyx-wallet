import { ScreenHeader } from '../ui/kit';
import React, { useRef } from 'react';
import { View, Text, Pressable, Linking } from 'react-native';
import { Stack, router } from 'expo-router';
import Constants from 'expo-constants';
import { PremiumScreen, GlassCard, ListRow } from '../ui/premium';
import { Button } from '../ui/components';
import { KalyxLogo } from '../ui/KalyxLogo';
import { Icon } from '../ui/icon';
import { spacing, useTheme, fonts } from '../ui/theme';
import { toast } from '../lib/toast';
import { useT } from '../lib/settingsStore';

// Liens de contact officiels Kalyx (Telegram & X).
const TELEGRAM_URL = 'https://t.me/kalyxntw';
const X_URL = 'https://x.com/kalyxntw';

export default function About() {
  const { colors, typography } = useTheme();
  const t = useT();
  const version = Constants.expoConfig?.version ?? '0.0.1';

  const openTelegram = () => {
    Linking.openURL(TELEGRAM_URL).catch(() => {});
  };

  const openX = () => {
    Linking.openURL(X_URL).catch(() => {});
  };

  // Design Lab (§9) : 7 taps sur la version, builds de dev uniquement.
  const taps = useRef(0);
  const onVersionTap = () => {
    if (!__DEV__) return;
    taps.current += 1;
    if (taps.current >= 7) {
      taps.current = 0;
      router.push('/design-lab');
    }
  };

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <PremiumScreen>
      <ScreenHeader title={t('about')} />

      {/* Identité */}
      <View style={{ alignItems: 'center', gap: spacing(1), paddingVertical: spacing(2) }}>
        <KalyxLogo size={84} />
        <Text style={{ color: colors.text, fontSize: 26, fontFamily: fonts.bold, letterSpacing: 0.5 }}>Kalyx Wallet</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Pressable onPress={onVersionTap} hitSlop={8} accessibilityLabel={`${t('versionWord')} ${version}`}>
            <Text style={typography.muted}>{t('versionWord')} v{version}</Text>
          </Pressable>
          <View style={{ backgroundColor: colors.warning + '22', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 }}>
            <Text style={{ color: colors.warning, fontSize: 10, fontFamily: fonts.bold, letterSpacing: 0.5 }}>{t('betaTag')}</Text>
          </View>
        </View>
      </View>

      <GlassCard>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: spacing(0.75) }}>
          <Text style={typography.muted}>{t('publisher')}</Text>
          <Text style={typography.bodyStrong}>Kalyx Network</Text>
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
        <ListRow divider left={<Icon name="telegramLogo" size={20} color={colors.textMuted} />} title={t('joinTelegram')} subtitle="t.me/kalyxntw" right={<Icon name="chevron" size={18} tone="faint" />} onPress={openTelegram} />
        <ListRow divider left={<Icon name="xLogo" size={20} color={colors.textMuted} />} title={t('followOnX')} subtitle="@kalyxntw" right={<Icon name="chevron" size={18} tone="faint" />} onPress={openX} />
      </GlassCard>

      <View style={{ flex: 1 }} />
      <Button label={t('joinTelegram')} onPress={openTelegram} />
      <Text style={[typography.muted, { textAlign: 'center', fontSize: 12, marginTop: spacing(1.5) }]}>
        © 2026 Malin. {t('allRightsReserved')}
      </Text>
      <View style={{ height: spacing(2) }} />
    </PremiumScreen>
    </>
  );
}
