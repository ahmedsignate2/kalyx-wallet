/**
 * AmountDisplay — montant chiffre par chiffre dans des cases de largeur fixe
 * (§2.5) : alignement au pixel ET roulement vertical quand la valeur change
 * (§3.4, moment signature n° 2). Chaque chiffre roule dans sa case, de droite
 * à gauche avec 20 ms de décalage, ressort Standard. « Réduire les animations » :
 * fondu de 150 ms.
 */
import React, { useEffect, useMemo } from 'react';
import { View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withDelay, withSpring, withTiming, useReducedMotion } from 'react-native-reanimated';
import { Text, type TextVariant } from './Text';
import { useTheme } from '../theme';
import { springs, durations } from '../tokens';

const DIGITS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];

function Digit({ value, height, width, delay, variant }: { value: number; height: number; width: number; delay: number; variant: TextVariant }) {
  const y = useSharedValue(-value * height);
  const reduced = useReducedMotion();
  useEffect(() => {
    const target = -value * height;
    y.value = reduced ? withTiming(target, { duration: durations.fade }) : withDelay(delay, withSpring(target, springs.standard));
  }, [value, height, delay, reduced, y]);
  const style = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }] }));
  return (
    <View style={{ height, width, overflow: 'hidden' }}>
      <Animated.View style={style}>
        {DIGITS.map((d) => (
          <Text key={d} variant={variant} tabular style={{ height, lineHeight: height, textAlign: 'center' }}>
            {d}
          </Text>
        ))}
      </Animated.View>
    </View>
  );
}

/**
 * `value` : chaîne déjà formatée (« 12 480,32 »). Les chiffres roulent, les
 * séparateurs (espace, virgule, point) sont rendus tels quels.
 */
export function AmountDisplay({ value, variant = 'balance', suffix, prefix }: { value: string; variant?: TextVariant; /** « € », « ETH » */ suffix?: string; prefix?: string }) {
  const { typography } = useTheme();
  const t = typography[variant] as { fontSize: number; lineHeight?: number };
  const height = t.lineHeight ?? Math.round(t.fontSize * 1.1);
  // Largeur d'un chiffre tabulaire ≈ 0,6 em pour General Sans.
  const width = Math.round(t.fontSize * 0.6);
  const chars = useMemo(() => value.split(''), [value]);
  const digitCount = chars.filter((c) => /\d/.test(c)).length;
  let seen = 0;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end' }} accessibilityLabel={`${prefix ?? ''}${value}${suffix ? ' ' + suffix : ''}`}>
      {prefix ? <Text variant={variant}>{prefix}</Text> : null}
      {chars.map((c, i) => {
        if (/\d/.test(c)) {
          const idx = seen++;
          // Décalage : le chiffre le plus à droite part en premier.
          const delay = (digitCount - 1 - idx) * 20;
          return <Digit key={`d${i}`} value={Number(c)} height={height} width={width} delay={delay} variant={variant} />;
        }
        return (
          <Text key={`s${i}`} variant={variant} style={{ height, lineHeight: height }}>
            {c}
          </Text>
        );
      })}
      {suffix ? <Text variant={variant} tone="secondary" style={{ marginLeft: 6, fontSize: t.fontSize * 0.5, lineHeight: height }}>{suffix}</Text> : null}
    </View>
  );
}
