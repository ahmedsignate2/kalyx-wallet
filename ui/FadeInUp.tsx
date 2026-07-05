/**
 * Entrée en fondu + légère montée, avec délai (pour un effet « cascade » quand
 * on l'applique à une liste : delay = index * pas). N'anime qu'au montage.
 * useNativeDriver → fluide, aucun coût JS pendant l'animation.
 */
import React, { useEffect, useRef } from 'react';
import { Animated, Easing } from 'react-native';

export function FadeInUp({
  children,
  delay = 0,
  distance = 12,
}: {
  children: React.ReactNode;
  delay?: number;
  distance?: number;
}) {
  const op = useRef(new Animated.Value(0)).current;
  const y = useRef(new Animated.Value(distance)).current;
  useEffect(() => {
    Animated.parallel([
      Animated.timing(op, { toValue: 1, duration: 360, delay, useNativeDriver: true }),
      Animated.timing(y, { toValue: 0, duration: 440, delay, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return <Animated.View style={{ opacity: op, transform: [{ translateY: y }] }}>{children}</Animated.View>;
}
