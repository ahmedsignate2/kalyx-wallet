/** Tuile de dApp uniforme (56 × 56, rayon 16, fond Nuit, logo 32) + label d'une ligne. Monogramme si le logo manque. */
import React, { useState } from 'react';
import { View, Image } from 'react-native';
import { Pressable, Text } from '../kit';
import { useTheme } from '../theme';
import { radius, space } from '../tokens';

export function faviconUrl(host: string): string {
  return `https://www.google.com/s2/favicons?domain=${host}&sz=128`;
}

export function DappLogo({ host, size = 32 }: { host: string; size?: number }) {
  const { colors } = useTheme();
  const [failed, setFailed] = useState(false);
  if (!host || failed) {
    return (
      <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: colors.surface3, alignItems: 'center', justifyContent: 'center' }}>
        <Text variant="caption">{(host || '?').slice(0, 1).toUpperCase()}</Text>
      </View>
    );
  }
  // Découpé en ROND et posé directement sur la tuile : plus de « tuile dans la tuile » (fond d'origine du logo).
  return <Image source={{ uri: faviconUrl(host) }} onError={() => setFailed(true)} style={{ width: size, height: size, borderRadius: size / 2 }} />;
}

export function DappTile({ host, label, onPress, width = 88 }: { host: string; label: string; onPress: () => void; width?: number }) {
  const { colors } = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityLabel={label} style={{ width, alignItems: 'center', gap: space[1] }}>
      <View style={{ width: 56, height: 56, borderRadius: radius.input + 4, backgroundColor: colors.surface1, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' }}>
        <DappLogo host={host} />
      </View>
      <Text variant="caption" numberOfLines={2} style={{ textAlign: 'center', maxWidth: width, minHeight: 32 }}>{label}</Text>
    </Pressable>
  );
}

/** Nom lisible d'un site : « app.uniswap.org » → « Uniswap » (sans extension, capitalisé). */
export function siteName(host: string): string {
  const parts = host.split('.').filter(Boolean);
  if (parts.length === 0) return host;
  const two = parts.length >= 3 && ['co', 'com', 'org', 'net', 'gov', 'ac'].includes(parts[parts.length - 2]) && parts[parts.length - 1].length === 2;
  const root = parts[parts.length - (two ? 3 : 2)] ?? parts[0];
  return root.charAt(0).toUpperCase() + root.slice(1);
}
