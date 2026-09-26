/**
 * Micro-animations du tableau de bord web (RN Animated, fiable sur
 * react-native-web) : entrée en fondu + glissement, compteur de solde,
 * fondu au changement d'onglet, halo respirant. Toutes respectent
 * `prefers-reduced-motion` (durée 0).
 */
import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, View, type StyleProp, type ViewStyle } from 'react-native';
import { KalyxLogo } from '../KalyxLogo';

/** Réglage système « réduire les animations ». Exporté : les animations vivant
 *  hors de ce fichier doivent le respecter aussi, sinon le réglage ne vaut que
 *  pour la moitié de l'interface. */
export function reducedMotion(): boolean {
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

/** Chargement : le logo Kalyx tourne lentement — remplace tout spinner générique. */
export function KalyxSpinner({ size = 22, style }: { size?: number; style?: StyleProp<ViewStyle> }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reducedMotion()) return;
    const loop = Animated.loop(Animated.timing(v, { toValue: 1, duration: 1400, easing: Easing.linear, useNativeDriver: false }));
    loop.start();
    return () => loop.stop();
  }, [v]);
  const rotate = v.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  return (
    <Animated.View accessibilityRole="progressbar" style={[{ width: size, height: size, transform: [{ rotate }] }, style]}>
      <KalyxLogo size={size} />
    </Animated.View>
  );
}

/** Le logo s'« allume » une fois (scale 1 → 1.18 → 1, anneau vert qui s'estompe) :
 *  confirmation qu'une signature a été validée sur le téléphone. */
export function KalyxSuccessPulse({ size = 56, ringColor }: { size?: number; ringColor: string }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reducedMotion()) { v.setValue(1); return; }
    const anim = Animated.timing(v, { toValue: 1, duration: 700, easing: EASE_OUT, useNativeDriver: false });
    anim.start();
    return () => anim.stop();
  }, [v]);
  const scale = v.interpolate({ inputRange: [0, 0.45, 1], outputRange: [0.8, 1.18, 1] });
  const ringScale = v.interpolate({ inputRange: [0, 1], outputRange: [0.8, 1.7] });
  const ringOpacity = v.interpolate({ inputRange: [0, 0.2, 1], outputRange: [0, 0.6, 0] });
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View pointerEvents="none" style={{ position: 'absolute', width: size, height: size, borderRadius: size / 2, borderWidth: 2, borderColor: ringColor, opacity: ringOpacity, transform: [{ scale: ringScale }] }} />
      <Animated.View style={{ transform: [{ scale }] }}>
        <KalyxLogo size={size * 0.72} />
      </Animated.View>
    </View>
  );
}

/** Petit « pop » (scale 1 → 1.3 → 1, 220 ms) déclenché à chaque changement de `trigger`
 *  — confirme un tap (ex. icône Copier qui devient une coche). */
export function Pop({ trigger, children }: { trigger: unknown; children: React.ReactNode }) {
  const v = useRef(new Animated.Value(1)).current;
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    if (reducedMotion()) return;
    v.setValue(1);
    Animated.sequence([
      Animated.timing(v, { toValue: 1.3, duration: 110, easing: Easing.out(Easing.quad), useNativeDriver: false }),
      Animated.spring(v, { toValue: 1, speed: 30, bounciness: 10, useNativeDriver: false }),
    ]).start();
  }, [trigger, v]);
  return <Animated.View style={{ transform: [{ scale: v }] }}>{children}</Animated.View>;
}

/** Texte révélé progressivement (≈ 40 caractères / 100 ms) — pour la réponse
 *  de l'agent qui arrive, comme une conversation ; `active=false` → texte entier. */
export function useTypewriter(text: string, active: boolean): string {
  const [n, setN] = useState(active && !reducedMotion() ? 0 : text.length);
  useEffect(() => {
    if (!active || reducedMotion()) { setN(text.length); return; }
    setN(0);
    let i = 0;
    const id = setInterval(() => {
      i = Math.min(text.length, i + 4);
      setN(i);
      if (i >= text.length) clearInterval(id);
    }, 12);
    return () => clearInterval(id);
  }, [text, active]);
  return text.slice(0, n);
}
