/**
 * Composant NovaRing : Anneau paramétrable et animé pour la refonte Nova.
 * 
 * Permet d'afficher un anneau de segments avec gestion de différents états :
 * - Mode déterminé (progress)
 * - Mode indéterminé (spinning)
 * - Mode célébration (burst animation)
 * - Mode erreur (contraction avec couleur rouge)
 */
import React, { useEffect, useRef, ReactNode } from 'react';
import { Animated, View, StyleSheet, Easing } from 'react-native';
import Svg, { Rect, G } from 'react-native-svg';
import { duration, spring } from './motion';

export interface NovaRingProps {
  size?: number;
  progress?: number;
  spinning?: boolean;
  celebrating?: boolean;
  error?: boolean;
  color?: string;
  children?: ReactNode;
}

const AnimatedRect = Animated.createAnimatedComponent(Rect);
const AnimatedG = Animated.createAnimatedComponent(G);

export function NovaRing({
  size = 120,
  progress = 0,
  spinning = false,
  celebrating = false,
  error = false,
  color,
  children,
}: NovaRingProps) {
  const rotation = useRef(new Animated.Value(0)).current;
  const burst = useRef(new Animated.Value(0)).current;
  const errScale = useRef(new Animated.Value(1)).current;

  // Couleurs par défaut
  const accentColor = color || '#C9A24B';
  const successColor = '#4A9B72';
  const dangerColor = '#C1554A';

  const ringColor = error ? dangerColor : celebrating ? successColor : accentColor;

  // Animation de rotation (spinning)
  useEffect(() => {
    if (spinning) {
      const anim = Animated.loop(
        Animated.timing(rotation, {
          toValue: 1,
          duration: 3000,
          easing: Easing.linear,
          useNativeDriver: true,
        })
      );
      anim.start();
      return () => anim.stop();
    } else {
      rotation.stopAnimation();
    }
  }, [spinning, rotation]);

  // Animation de célébration (burst)
  useEffect(() => {
    if (celebrating) {
      burst.setValue(1);
      Animated.spring(burst, {
        toValue: 0,
        ...spring.soft,
      }).start();
    }
  }, [celebrating, burst]);

  // Animation d'erreur (scale)
  useEffect(() => {
    if (error) {
      Animated.sequence([
        Animated.timing(errScale, {
          toValue: 0.85,
          duration: duration.fast,
          useNativeDriver: true,
        }),
        Animated.timing(errScale, {
          toValue: 1,
          duration: duration.fast,
          useNativeDriver: true,
        })
      ]).start();
    }
  }, [error, errScale]);

  const spinInterpolation = rotation.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  const segments = Array.from({ length: 16 }).map((_, i) => {
    const angle = (360 / 16) * i;
    const rad = (angle * Math.PI) / 180;
    const baseOuter = 38 + 6 * Math.cos(rad);
    const inner = 20;
    const width = 5.5;

    // Détermination de l'état actif (opacité)
    const isActive = progress === 0 || (i / 16) <= progress;

    // Offsets pour le burst
    const burstOuter = burst.interpolate({
      inputRange: [0, 1],
      outputRange: [baseOuter, baseOuter + 10]
    });

    const burstInner = burst.interpolate({
      inputRange: [0, 1],
      outputRange: [inner, inner + 5]
    });

    const h = Animated.subtract(burstOuter, burstInner);
    const y = Animated.multiply(burstOuter, -1);

    return (
      <G key={i} transform={`rotate(${angle} 0 0)`}>
        <AnimatedRect
          x={-width / 2}
          y={y}
          width={width}
          height={h}
          rx={width / 2}
          fill={ringColor}
          opacity={isActive ? 1 : 0.2}
        />
      </G>
    );
  });

  return (
    <View style={[styles.container, { width: size, height: size }]}>
      <Animated.View style={[StyleSheet.absoluteFill, {
        transform: [
          { rotate: spinning ? spinInterpolation : '0deg' },
          { scale: errScale }
        ]
      }]}>
        <Svg width="100%" height="100%" viewBox="-50 -50 100 100">
          {segments}
        </Svg>
      </Animated.View>
      <View style={styles.center}>
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  center: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
