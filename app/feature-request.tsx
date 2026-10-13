import { NovaHero, SettingRow } from '../ui/nova';
import { ScreenHeader, Card, Screen } from '../ui/kit';
import { Linking } from 'react-native';
import { Stack } from 'expo-router';
import { useT } from '../lib/settingsStore';

export default function FeatureRequestScreen() {
  const t = useT();

  const openUrl = (url: string) => {
    Linking.openURL(url).catch((err) => {
      console.warn('[FeatureRequest] Failed to open URL:', err);
    });
  };

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <Screen scene="top">
        <ScreenHeader />
        <NovaHero icon="bulb" tone="gold" title={t('communityTitle')} subtitle={t('communityDesc')} />

        {/* Liens communautaires */}
        <Card rise delay={140}>
          <SettingRow icon="xLogo" title={t('followOnX')} hint="@kalyxntw" onPress={() => openUrl('https://x.com/kalyxntw')} />
          <SettingRow divider icon="telegramLogo" title={t('joinTelegram')} hint="t.me/kalyxntw" onPress={() => openUrl('https://t.me/kalyxntw')} />
        </Card>
      </Screen>
    </>
  );
}
