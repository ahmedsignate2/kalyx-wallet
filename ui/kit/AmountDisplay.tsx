/**
 * AmountDisplay — montant chiffre par chiffre dans des cases de largeur fixe
 * (§2.5) : alignement au pixel ET roulement vertical quand la valeur change
 * (§3.4, moment signature n° 2). Chaque chiffre roule dans sa case, de droite
 * à gauche avec 20 ms de décalage, ressort Standard. « Réduire les animations » :
 * fondu de 150 ms.
 *
 * SENS DU ROULEMENT (docs/08 §8) : une hausse roule vers le HAUT, une baisse
 * vers le BAS. Ça paraît un détail, c'en est un qui se sent : un solde qui monte
 * en descendant visuellement donne une impression de faute.
 *
 * Le chiffre 9 qui passe à 0 doit donc continuer vers le haut, pas revenir en
 * arrière. La bande contient pour cela TROIS cycles de 0-9 et le chiffre vit au
 * milieu : depuis là, n'importe quel changement (au plus 9 positions) peut
 * s'atteindre vers le haut comme vers le bas sans sortir de la bande. Une fois
 * le ressort posé, on ramène silencieusement la position au cycle central —
 * même image à l'écran, prêt pour le prochain roulement.
 */
import React, { useEffect, useMemo, useRef } from 'react';
import { View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withDelay, withSpring, withTiming, useReducedMotion } from 'react-native-reanimated';
import { Text, type TextVariant } from './Text';
import { useTheme } from '../theme';
import { springs, durations } from '../tokens';

const DIGITS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
/** Trois cycles : un chiffre au milieu peut monter ou descendre de 9 sans sortir. */
const STRIP = [...DIGITS, ...DIGITS, ...DIGITS];
const CYCLE = DIGITS.length;
/** Position canonique du chiffre `d` : cycle central. */
const canon = (d: number) => CYCLE + d;

export type RollDirection = 'up' | 'down' | 'none';

function Digit({
  value, height, width, delay, variant, direction,
}: {
  value: number;
  height: number;
  width: number;
  delay: number;
  variant: TextVariant;
  direction: RollDirection;
}) {
  const y = useSharedValue(-canon(value) * height);
  const shown = useRef(value);
  const reduced = useReducedMotion();

  useEffect(() => {
    const from = shown.current;
    shown.current = value;
    const rest = -canon(value) * height;
    if (reduced || direction === 'none' || from === value) {
      y.value = reduced ? withTiming(rest, { duration: durations.fade }) : withDelay(delay, withSpring(rest, springs.standard));
      return;
    }
    /*
     * Position visée dans le sens imposé. `(value - from + 10) % 10` est le
     * nombre de crans à monter ; pour descendre, on prend le complément. On part
     * TOUJOURS du cycle central, donc la cible reste dans la bande.
     */
    const upSteps = (value - from + CYCLE) % CYCLE;
    const steps = direction === 'up' ? upSteps : -((from - value + CYCLE) % CYCLE);
    const target = -(canon(from) + steps) * height;
    y.value = withDelay(
      delay,
      withSpring(target, springs.standard, (finished) => {
        // Recentrage silencieux : même chiffre affiché, position remise au milieu.
        if (finished) y.value = rest;
      }),
    );
  }, [value, height, delay, reduced, direction, y]);

  const style = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }] }));
  return (
    <View style={{ height, width, overflow: 'hidden' }}>
      <Animated.View style={style}>
        {STRIP.map((d, i) => (
          <Text key={i} variant={variant} tabular style={{ height, lineHeight: height, textAlign: 'center' }}>
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
export function AmountDisplay({
  value, variant = 'balance', suffix, prefix, direction = 'none',
}: {
  value: string;
  variant?: TextVariant;
  /** « € », « ETH » */
  suffix?: string;
  prefix?: string;
  /**
   * Sens imposé au roulement (§8). `'none'` : chaque chiffre prend le chemin le
   * plus court, ce qui convient quand la valeur ne « monte » ni ne « descend »
   * (première apparition, changement de devise).
   */
  direction?: RollDirection;
}) {
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
          return <Digit key={`d${i}`} value={Number(c)} height={height} width={width} delay={delay} variant={variant} direction={direction} />;
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
