/**
 * Le MOMENT de l'envoi — ce qu'on voit après avoir maintenu l'anneau.
 *
 * Un disque au centre de son orbite, dans la lumière du halo :
 *  - en route : un arc d'or tourne autour du disque, comme une comète en
 *    orbite ; le montant est affiché, sobre ;
 *  - confirmé : le disque se remplit d'or, la coche apparaît au ressort, une
 *    gerbe d'étincelles jaillit et le téléphone vibre (succès). C'est la seule
 *    célébration de l'app : elle est réservée au moment où l'argent est arrivé ;
 *  - échec : croix rouge et une secousse brève — pas d'étincelles.
 */
import React, { useEffect } from 'react';
import { View } from 'react-native';
import Animated, { Easing, cancelAnimation, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';
import { Text, Halo } from './kit';
import { SparkBurst } from './kit/SparkBurst';
import { Icon } from './icon';
import { useTheme } from './theme';
import { BRAND_GOLD } from './tokens';
import { useReduceMotion } from '../lib/reduceMotion';
import { haptic } from '../lib/haptics';
import type { TxStage } from './kit';

const D = 104;
const R = 66;

export function SendResult({ stage, amount, dest }: { stage: TxStage; amount: string; dest: string }) {
  const { colors } = useTheme();
  const reduce = useReduceMotion();
  const done = stage === 'confirmed';
  const failed = stage === 'failed';

  const spin = useSharedValue(0);
  const fill = useSharedValue(0);
  const shake = useSharedValue(0);
  useEffect(() => {
    if (done || failed || reduce) {
      cancelAnimation(spin);
      return;
    }
    spin.value = withRepeat(withTiming(1, { duration: 1400, easing: Easing.linear }), -1, false);
    return () => cancelAnimation(spin);
  }, [done, failed, reduce, spin]);
  useEffect(() => {
    if (done) {
      haptic.success();
      fill.value = reduce ? 1 : withSpring(1, { damping: 11, stiffness: 140 });
    } else if (failed) {
      haptic.error();
      fill.value = withTiming(1, { duration: 200 });
      if (!reduce) shake.value = withSequence(withTiming(-10, { duration: 50 }), withTiming(10, { duration: 70 }), withTiming(-6, { duration: 60 }), withTiming(0, { duration: 60 }));
    }
  }, [done, failed, reduce, fill, shake]);

  const arcStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${spin.value * 360}deg` }], opacity: 1 - fill.value }));
  const discStyle = useAnimatedStyle(() => ({ transform: [{ translateX: shake.value }, { scale: 0.92 + 0.08 * fill.value }] }));
  const markStyle = useAnimatedStyle(() => ({ opacity: fill.value, transform: [{ scale: 0.4 + 0.6 * fill.value }] }));
  const C = 2 * Math.PI * R;
  const tint = failed ? colors.danger : BRAND_GOLD.light;

  return (
    <View style={{ alignItems: 'center', gap: 14, paddingTop: 8 }}>
      <View style={{ width: 220, height: 200, alignItems: 'center', justifyContent: 'center' }}>
        <View pointerEvents="none" style={{ position: 'absolute' }}>
          <Halo size={260} mood={failed ? 'down' : 'up'} aura />
        </View>
        {/* Orbite fixe, et la comète d'or qui la parcourt tant que l'envoi est en route. */}
        <Svg width={R * 2 + 8} height={R * 2 + 8} style={{ position: 'absolute' }}>
          <Circle cx={R + 4} cy={R + 4} r={R} stroke={colors.border} strokeWidth={1.5} fill="none" />
        </Svg>
        <Animated.View style={[{ position: 'absolute', width: R * 2 + 8, height: R * 2 + 8 }, arcStyle]}>
          <Svg width={R * 2 + 8} height={R * 2 + 8}>
            <Circle cx={R + 4} cy={R + 4} r={R} stroke={BRAND_GOLD.light} strokeWidth={3} fill="none" strokeLinecap="round" strokeDasharray={`${C * 0.22} ${C}`} />
          </Svg>
        </Animated.View>
        <Animated.View style={[{ width: D, height: D, borderRadius: D / 2, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border }, discStyle]}>
          <Animated.View style={[{ position: 'absolute', width: D, height: D, borderRadius: D / 2, backgroundColor: tint }, markStyle]} />
          {done || failed ? (
            <Animated.View style={markStyle}>
              <Icon name={failed ? 'close' : 'checkmark'} size={46} color={failed ? '#FFFFFF' : '#1A1408'} />
            </Animated.View>
          ) : (
            <Icon name="send" size={34} color={colors.text} />
          )}
        </Animated.View>
        {done && !reduce ? <SparkBurst burstKey="sent" count={36} radius={92} /> : null}
      </View>
      <Text variant="balance" tabular style={{ fontSize: 34, lineHeight: 40, textAlign: 'center' }}>{amount}</Text>
      <Text variant="bodySecondary" tone="secondary" style={{ textAlign: 'center' }}>{dest}</Text>
    </View>
  );
}
