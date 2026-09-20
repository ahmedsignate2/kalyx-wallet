/**
 * Micro-animations du tableau de bord web (RN Animated, fiable sur
 * react-native-web) : entrée en fondu + glissement, compteur de solde,
 * fondu au changement d'onglet, halo respirant. Toutes respectent
 * `prefers-reduced-motion` (durée 0).
 */
import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, type StyleProp, type ViewStyle } from 'react-native';

function reducedMotion(): boolean {
  try {
    const m = (globalThis as { matchMedia?: (q: string) => { matches: boolean } }).matchMedia;
    return !!m && m('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

const EASE_OUT = Easing.bezier(0.22, 1, 0.36, 1);

/** Apparition : opacité 0→1 + translation 14px→0, avec délai (cascade). */
export function FadeInUp({ delay = 0, distance = 14, duration = 420, style, children }: { delay?: number; distance?: number; duration?: number; style?: StyleProp<ViewStyle>; children: React.ReactNode }) {
  const v = useRef(new Animated.Value(reducedMotion() ? 1 : 0)).current;
  useEffect(() => {
    if (reducedMotion()) return;
    const anim = Animated.timing(v, { toValue: 1, duration, delay, easing: EASE_OUT, useNativeDriver: false });
    anim.start();
    return () => anim.stop();
  }, [v, delay, duration]);
  return (
    <Animated.View style={[style, { opacity: v, transform: [{ translateY: Animated.multiply(Animated.subtract(1, v), distance) }] }]}>
      {children}
    </Animated.View>
  );
}

/** Fondu à chaque changement de `id` (onglet, période…). */
export function CrossFade({ id, children, style }: { id: string | number; children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const v = useRef(new Animated.Value(1)).current;
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    if (reducedMotion()) return;
    v.setValue(0);
    const anim = Animated.timing(v, { toValue: 1, duration: 260, easing: EASE_OUT, useNativeDriver: false });
    anim.start();
    return () => anim.stop();
  }, [id, v]);
  return (
    <Animated.View style={[style, { opacity: v, transform: [{ translateY: Animated.multiply(Animated.subtract(1, v), 8) }] }]}>
      {children}
    </Animated.View>
  );
}

/** Valeur numérique qui « compte » vers sa cible (solde, prix) au lieu de sauter. */
export function useCountUp(target: number | null, duration = 700): number | null {
  const [shown, setShown] = useState<number | null>(target);
  const from = useRef<number>(target ?? 0);
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (target == null) { setShown(null); return; }
    if (reducedMotion() || shown == null) { from.current = target; setShown(target); return; }
    const start = from.current;
    if (start === target) return;
    v.setValue(0);
    const id = v.addListener(({ value }) => setShown(start + (target - start) * value));
    const anim = Animated.timing(v, { toValue: 1, duration, easing: EASE_OUT, useNativeDriver: false });
    anim.start(({ finished }) => { if (finished) { from.current = target; setShown(target); } });
    return () => { v.removeListener(id); anim.stop(); from.current = target; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, duration]);
  return shown;
}

/** Halo qui respire lentement (opacité 0.7↔1, 3,2 s) — derrière le solde. */
export function Breathing({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reducedMotion()) return;
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(v, { toValue: 1, duration: 3200, easing: Easing.inOut(Easing.sin), useNativeDriver: false }),
      Animated.timing(v, { toValue: 0, duration: 3200, easing: Easing.inOut(Easing.sin), useNativeDriver: false }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [v]);
  const opacity = v.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1] });
  const scale = v.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1.04] });
  return <Animated.View pointerEvents="none" style={[style, { opacity, transform: [{ scale }] }]}>{children}</Animated.View>;
}

/** Pression : léger enfoncement (scale 0.97) avec ressort au relâchement. */
export function usePressScale() {
  const v = useRef(new Animated.Value(1)).current;
  const onPressIn = () => Animated.spring(v, { toValue: 0.97, useNativeDriver: false, speed: 40, bounciness: 0 }).start();
  const onPressOut = () => Animated.spring(v, { toValue: 1, useNativeDriver: false, speed: 20, bounciness: 8 }).start();
  return { style: { transform: [{ scale: v }] } as const, onPressIn, onPressOut };
}
