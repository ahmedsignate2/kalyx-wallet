/**
 * Fond « aurora » animé : des halos de couleur (violet/bleu/magenta) qui
 * dérivent et respirent lentement, façon Phantom/Rainbow. Donne de la
 * profondeur et un côté « vivant » aux écrans d'accueil / déverrouillage.
 *
 * 100 % Animated (transform + opacity, useNativeDriver) + SVG statique → fluide,
 * sans dépendance native supplémentaire. À poser derrière le contenu.
 */
import React, { useEffect, useRef } from 'react';
import { Animated, Dimensions, Easing, StyleSheet } from 'react-native';
import Svg, { Defs, RadialGradient, Stop, Circle } from 'react-native-svg';
import { useTheme } from './theme';

const { width: W, height: H } = Dimensions.get('window');

interface OrbSpec {
  id: string;
  color: string;
  size: number;
  x: number;
  y: number;
  dx: number;
  dy: number;
  duration: number;
  delay: number;
  opacity: number;
}

function Orb({ spec }: { spec: OrbSpec }) {
  const t = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(t, { toValue: 1, duration: spec.duration, delay: spec.delay, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(t, { toValue: 0, duration: spec.duration, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [t, spec]);

  const translateX = t.interpolate({ inputRange: [0, 1], outputRange: [spec.x, spec.x + spec.dx] });
  const translateY = t.interpolate({ inputRange: [0, 1], outputRange: [spec.y, spec.y + spec.dy] });
  const scale = t.interpolate({ inputRange: [0, 1], outputRange: [1, 1.22] });

  return (
    <Animated.View
      pointerEvents="none"
      style={{ position: 'absolute', width: spec.size, height: spec.size, opacity: spec.opacity, transform: [{ translateX }, { translateY }, { scale }] }}
    >
      <Svg width={spec.size} height={spec.size}>
        <Defs>
          <RadialGradient id={spec.id} cx="50%" cy="50%" r="50%">
            <Stop offset="0%" stopColor={spec.color} stopOpacity={0.9} />
            <Stop offset="60%" stopColor={spec.color} stopOpacity={0.35} />
            <Stop offset="100%" stopColor={spec.color} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Circle cx={spec.size / 2} cy={spec.size / 2} r={spec.size / 2} fill={`url(#${spec.id})`} />
      </Svg>
    </Animated.View>
  );
}

export function AuroraBackground({ intensity = 1 }: { intensity?: number }) {
  const { colors } = useTheme();
  const orbs: OrbSpec[] = [
    // L'aurora devient très sourde (or/graphite). On garde les teintes d'accent (or bruni).
    { id: 'aurora-a', color: colors.accent, size: W * 1.1, x: -W * 0.35, y: -H * 0.12, dx: W * 0.18, dy: H * 0.06, duration: 9000, delay: 0, opacity: 0.18 * intensity },
    { id: 'aurora-b', color: colors.accentAlt, size: W * 0.95, x: W * 0.45, y: H * 0.1, dx: -W * 0.2, dy: H * 0.1, duration: 11000, delay: 600, opacity: 0.14 * intensity },
    { id: 'aurora-c', color: colors.textMuted, size: W * 0.8, x: W * 0.05, y: H * 0.5, dx: W * 0.15, dy: -H * 0.08, duration: 12500, delay: 1200, opacity: 0.08 * intensity },
  ];
  return (
    <Animated.View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {orbs.map((spec) => (
        <Orb key={spec.id} spec={spec} />
      ))}
    </Animated.View>
  );
}
