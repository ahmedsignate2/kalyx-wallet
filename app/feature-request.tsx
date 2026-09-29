import { NovaCard, NovaHero, SettingRow } from '../ui/nova';
import { ScreenHeader } from '../ui/kit';
import React from 'react';
import { View, Text, Linking } from 'react-native';
import { Stack } from 'expo-router';
import { PremiumScreen, GlassCard, ListRow } from '../ui/premium';
import { Icon, type IconName } from '../ui/icon';
import { spacing, useTheme } from '../ui/theme';
import { useT } from '../lib/settingsStore';

function SocialIcon({ name }: { name: IconName }) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        width: 40,
        height: 40,
        borderRadius: 12,
        backgroundColor: colors.surface2,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Icon name={name} size={20} color={colors.text} />
    </View>
  );
}

export default function FeatureRequestScreen() {
  const { colors, typography } = useTheme();
  const t = useT();

  const openUrl = (url: string) => {
    Linking.openURL(url).catch((err) => {
      console.warn('[FeatureRequest] Failed to open URL:', err);
    });
  };

  const chevron = <Icon name="chevron" size={18} tone="faint" />;

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <PremiumScreen>
        <ScreenHeader />
        <NovaHero icon="bulb" tone="gold" title={t('communityTitle')} subtitle={t('communityDesc')} />

        {/* Liens communautaires */}
        <NovaCard delay={140}>
          <SettingRow icon="xLogo" title={t('followOnX')} hint="@kalyxntw" onPress={() => openUrl('https://x.com/kalyxntw')} />
          <SettingRow divider icon="telegramLogo" title={t('joinTelegram')} hint="t.me/kalyxntw" onPress={() => openUrl('https://t.me/kalyxntw')} />
        </NovaCard>
      </PremiumScreen>
    </>
  );
}
