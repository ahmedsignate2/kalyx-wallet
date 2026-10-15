/**
 * Image d'un NFT, avec ses REPLIS : si une image ne se charge pas (lien mort,
 * format non décodé), la suivante est essayée ; un SVG inscrit dans le NFT est
 * dessiné tel quel. En dernier recours, une case lisible avec le nom — jamais
 * une case vide.
 */
import { useMemo, useState } from 'react';
import { Image, View, type StyleProp, type ViewStyle } from 'react-native';
import { SvgXml } from 'react-native-svg';
import { Icon } from './icon';
import { Text } from './kit';
import { useTheme } from './theme';
import type { NftItem } from '../src';

export function NftImage({ nft, size, style, showName = false }: { nft: Pick<NftItem, 'image' | 'images' | 'svg' | 'name'>; size: number; style?: StyleProp<ViewStyle>; showName?: boolean }) {
  const { colors } = useTheme();
  const sources = useMemo(() => [nft.image, ...(nft.images ?? [])].filter(Boolean), [nft.image, nft.images]);
  const [idx, setIdx] = useState(0);
  const [svgFailed, setSvgFailed] = useState(false);
  const box = [{ width: size, height: size, backgroundColor: colors.surface2, overflow: 'hidden' as const }, style];

  if (idx < sources.length) {
    return (
      <View style={box}>
        <Image key={sources[idx]} source={{ uri: sources[idx] }} style={{ width: size, height: size }} resizeMode="cover" onError={() => setIdx((i) => i + 1)} />
      </View>
    );
  }
  if (nft.svg && !svgFailed) {
    return (
      <View style={box}>
        <SvgXml xml={nft.svg} width={size} height={size} onError={() => setSvgFailed(true)} />
      </View>
    );
  }
  return (
    <View style={[box, { alignItems: 'center', justifyContent: 'center', gap: 6, padding: 10 }]}>
      <Icon name="nft" size={Math.min(28, size / 4)} tone="faint" />
      {showName ? <Text variant="caption" tone="secondary" numberOfLines={2} style={{ textAlign: 'center' }}>{nft.name}</Text> : null}
    </View>
  );
}
