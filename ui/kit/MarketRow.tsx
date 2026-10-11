/** Ligne de cotation du Marché (logo, nom, mini-courbe, prix, variation) et sa mini-courbe. */
import { memo, useMemo } from 'react';
import { View } from 'react-native';
import Svg, { Polyline } from 'react-native-svg';
import { Text } from './Text';
import { Pressable } from './Pressable';
import { LogoImage } from './LogoImage';
import { Avatar } from './Avatar';
import { useTheme } from '../theme';
import { fontWeight, spaces } from '../tokens';
import { formatPercent } from '../../src';

/** Mini-graphe (react-native-svg). Les points ne sont recalculés que si la série change. */
export const Sparkline = memo(function Sparkline({
  data,
  color,
  width = 88,
  height = 34,
}: {
  data: number[];
  color: string;
  width?: number;
  height?: number;
}) {
  const points = useMemo(() => {
    if (data.length < 2) return null;
    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min || 1;
    const pad = 3;
    return data
      .map((v, i) => {
        const x = (i / (data.length - 1)) * (width - pad * 2) + pad;
        const y = height - pad - ((v - min) / range) * (height - pad * 2);
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');
  }, [data, width, height]);
  if (!points) return <View style={{ width, height }} />;
  return (
    <Svg width={width} height={height}>
      <Polyline points={points} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
    </Svg>
  );
});

type MarketRowProps = {
  icon: string;
  color: string;
  imageUri?: string;
  name: string;
  symbol: string;
  price: string;
  change: number;
  spark: number[];
  divider?: boolean;
  onPress?: () => void;
};

/*
 * Comparaison ciblée : une ligne du Marché ne se redessine que si ce qu'elle
 * affiche change. `onPress` est comparé par identité : l'appelant doit le
 * garder stable (useCallback) pour profiter de la mémoïsation.
 */
const sameMarketRow = (a: MarketRowProps, b: MarketRowProps) =>
  a.price === b.price &&
  a.change === b.change &&
  a.spark === b.spark &&
  a.name === b.name &&
  a.symbol === b.symbol &&
  a.imageUri === b.imageUri &&
  a.icon === b.icon &&
  a.color === b.color &&
  a.divider === b.divider &&
  a.onPress === b.onPress;

export const MarketRow = memo(function MarketRow({ icon, color, imageUri, name, symbol, price, change, spark, divider, onPress }: MarketRowProps) {
  const { colors } = useTheme();
  const up = change >= 0;
  const c = up ? colors.up : colors.down;
  const content = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spaces.md, paddingVertical: spaces.md, borderTopWidth: divider ? 1 : 0, borderTopColor: colors.border }}>
      {imageUri ? <LogoImage uri={imageUri} size={42} /> : <Avatar label={icon} color={color} />}
      <View style={{ width: 88 }}>
        <Text variant="bodyStrong">{name}</Text>
        <Text variant="label">{symbol}</Text>
      </View>
      <View style={{ flex: 1, alignItems: 'center' }}>
        <Sparkline data={spark} color={c} />
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Text variant="label" style={{ color: colors.text, fontFamily: fontWeight.semibold }}>{price}</Text>
        <Text variant="caption" style={{ color: c }}>
          {/* Même format que l'accueil (« +2,4 % ») : le Marché affichait « +2.40% ». */}
          {up ? '+' : ''}
          {formatPercent(change, 1)}
        </Text>
      </View>
    </View>
  );
  return onPress ? <Pressable onPress={onPress}>{content}</Pressable> : content;
}, sameMarketRow);
