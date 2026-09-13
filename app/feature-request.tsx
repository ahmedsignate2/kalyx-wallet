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
        backgroundColor: colors.glassStrong,
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
        <ScreenHeader title={t('featureRequestTitle')} />

        <View style={{ gap: spacing(2) }}>
          {/* Carte d'en-tête */}
          <GlassCard glow>
            <View style={{ alignItems: 'center', gap: spacing(1), paddingVertical: spacing(1) }}>
              <View
                style={{
                  width: 52,
                  height: 52,
                  borderRadius: 26,
                  backgroundColor: colors.glassStrong,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Icon name="bulb" size={26} color={colors.accent} />
              </View>
              <Text style={[typography.title, { textAlign: 'center', fontSize: 20 }]}>
                {t('communityTitle')}
              </Text>
              <Text style={[typography.muted, { textAlign: 'center', paddingHorizontal: spacing(1) }]}>
                {t('communityDesc')}
              </Text>
            </View>
          </GlassCard>

          {/* Liens communautaires */}
          <GlassCard>
            {/* Option 1 : X (Twitter) */}
            <ListRow
              left={<SocialIcon name="xLogo" />}
              title={t('followOnX')}
              subtitle="@kalyxntw"
              right={chevron}
              onPress={() => openUrl('https://x.com/kalyxntw')}
            />

            {/* Option 2 : Telegram */}
            <ListRow
              divider
              left={<SocialIcon name="telegramLogo" />}
              title={t('joinTelegram')}
              subtitle="t.me/kalyxntw"
              right={chevron}
              onPress={() => openUrl('https://t.me/kalyxntw')}
            />
          </GlassCard>
        </View>
      </PremiumScreen>
    </>
  );
}
