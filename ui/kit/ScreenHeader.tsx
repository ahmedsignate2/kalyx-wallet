import { useT } from "../../lib/settingsStore";
/**
 * En-tête d'écran Kalyx — rangée de 48 sous la barre d'état : retour, titre,
 * action à droite. Remplace l'en-tête natif (désactivé globalement dans
 * app/_layout.tsx : il empilait sa hauteur au-dessus du padding des écrans →
 * « trop d'espace vide en haut » sur tous les écrans secondaires).
 */
import React from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { IconButton } from './Button';
import { Text } from './Text';
import { space } from '../tokens';

export function ScreenHeader({ title, right, onBack, fallback = '/home' }: { title?: string; right?: React.ReactNode; onBack?: () => void; /** Route si aucun écran précédent. */ fallback?: string }) {
  const t = useT();
  return (
    <View style={{ height: 48, flexDirection: 'row', alignItems: 'center', gap: space[2], marginLeft: -space[2] }}>
      <IconButton icon="back" label={t("back")} tone="ghost" onPress={onBack ?? (() => (router.canGoBack() ? router.back() : router.replace(fallback as never)))} />
      {title ? <Text variant="title2" numberOfLines={1} style={{ flex: 1 }}>{title}</Text> : <View style={{ flex: 1 }} />}
      {right}
    </View>
  );
}
