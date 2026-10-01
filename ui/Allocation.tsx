/**
 * RÉPARTITION du portefeuille — « où est mon argent ? » d'un coup d'œil.
 *
 * Une barre unique, segmentée aux couleurs des actifs (ou des réseaux), qui se
 * remplit de gauche à droite à l'apparition ; dessous, les cinq plus grosses
 * parts et « Autres ». Deux vues : par actif (ETH, SOL, USDC…) et par réseau
 * (Ethereum, Base, Solana…) — un même ETH réparti sur trois réseaux compte une
 * fois dans la première, trois fois dans la seconde.
 *
 * Les couleurs viennent du système de teintes (lib/tokenColors) : la même que
 * sur la fiche de l'actif. Rien n'est inventé : un actif sans valeur connue ne
 * compte pas.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withDelay, withSpring } from 'react-native-reanimated';
import { Text } from './kit';
import { Pills } from './nova';
import { useTheme } from './theme';
import { fontFamily } from './tokens';
import { useReduceMotion } from '../lib/reduceMotion';
import { allocationSlices, type AllocationInput, type Slice } from '../lib/allocation';

function Segment({ s, i, w }: { s: Slice; i: number; w: number }) {
  const reduce = useReduceMotion();
  const p = useSharedValue(reduce ? 1 : 0);
  useEffect(() => {
    if (reduce) return;
    p.value = 0;
    p.value = withDelay(80 + i * 70, withSpring(1, { damping: 20, stiffness: 120 }));
  }, [s.pct, w, i, reduce, p]);
  const style = useAnimatedStyle(() => ({ width: Math.max(0, (s.pct / 100) * w * p.value - 2) }));
  return <Animated.View style={[{ height: 10, borderRadius: 5, backgroundColor: s.color, marginRight: 2 }, style]} />;
}

export function Allocation({ items, labels }: { items: AllocationInput[]; labels: { title: string; byAsset: string; byChain: string; other: string } }) {
  const { colors } = useTheme();
  const [by, setBy] = useState<'asset' | 'chain'>('asset');
  const [w, setW] = useState(0);
  const slices = useMemo(() => allocationSlices(items, by, labels.other), [items, by, labels.other]);
  if (slices.length < 2) return null; // un seul actif : rien à répartir
  return (
    <View style={{ gap: 12, padding: 16, borderRadius: 24, backgroundColor: colors.surface1, borderWidth: 1, borderColor: colors.border, borderTopColor: colors.rim }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text variant="body" style={{ fontFamily: fontFamily.semibold }}>{labels.title}</Text>
        <Pills items={[{ key: 'asset', label: labels.byAsset }, { key: 'chain', label: labels.byChain }]} value={by} onChange={setBy} />
      </View>
      <View style={{ flexDirection: 'row', height: 10, borderRadius: 5, overflow: 'hidden', backgroundColor: colors.surface2 }} onLayout={(e) => setW(e.nativeEvent.layout.width)}>
        {w ? slices.map((s, i) => <Segment key={`${by}-${s.key}`} s={s} i={i} w={w} />) : null}
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: 10, columnGap: 16 }}>
        {slices.map((s) => (
          <View key={s.key} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, minWidth: '40%' }}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: s.color }} />
            <Text variant="caption" numberOfLines={1} style={{ flexShrink: 1 }}>{s.label}</Text>
            <Text variant="caption" tone="secondary" tabular>{s.pct < 1 ? '<1' : Math.round(s.pct)} %</Text>
          </View>
        ))}
      </View>
    </View>
  );
}
