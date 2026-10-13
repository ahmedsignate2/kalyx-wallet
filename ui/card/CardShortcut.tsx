/**
 * Raccourci « Ma carte » de l'accueil : la carte à un toucher, sans passer par
 * les Réglages. Une mini-carte dans la matière choisie, l'émetteur s'il est
 * configuré, sinon l'invitation à en commander une.
 */
import { useEffect } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Card, Pressable, Text } from '../kit';
import { Icon } from '../icon';
import { KalyxLogo } from '../KalyxLogo';
import { space } from '../tokens';
import { useT } from '../../lib/settingsStore';
import { useCardPrefs, type CardTheme } from '../../lib/cardPrefs';
import { cardIssuer } from '../../src/domain/card/cardIssuers';

const MINI: Record<CardTheme, readonly [string, string, ...string[]]> = {
  holo: ['#F7C6D9', '#C9B6F2', '#A9E4EC'],
  noir: ['#2B2B33', '#0E0E12'],
  creme: ['#FCF6EC', '#E6D6BC'],
};

export function CardShortcut() {
  const t = useT();
  const { theme, issuer, configured, loaded, load } = useCardPrefs();
  useEffect(() => {
    void load();
  }, [load]);
  if (!loaded) return null;
  const name = issuer ? cardIssuer(issuer).dapp.name : null;
  return (
    <Pressable onPress={() => router.push('/card')} accessibilityRole="button" accessibilityLabel={t('cardHomeTitle')}>
      <Card style={{ flexDirection: 'row', alignItems: 'center', gap: space[3] }}>
        <LinearGradient colors={MINI[theme]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ width: 52, height: 34, borderRadius: 7, padding: 5, justifyContent: 'space-between' }}>
          <KalyxLogo size={11} />
          <View style={{ width: 11, height: 8, borderRadius: 2, backgroundColor: '#D9BE7A' }} />
        </LinearGradient>
        <View style={{ flex: 1 }}>
          <Text variant="bodyStrong">{t('cardHomeTitle')}</Text>
          <Text variant="caption" tone="secondary" numberOfLines={1}>{configured && name ? t('cardHomeSub').replace('{issuer}', name) : t('cardHomeSetup')}</Text>
        </View>
        <Icon name="chevron" size={18} tone="faint" />
      </Card>
    </Pressable>
  );
}
