/**
 * Entrées animées communes : la carte qui monte (`Rise`), l'écran qui apparaît
 * (`useScreenEntrance`), et la garde qui retire le style animé une fois joué.
 */
import React, { useEffect, useState } from 'react';
import { type StyleProp, type ViewStyle } from 'react-native';
import Animated, { Easing, cancelAnimation, useAnimatedStyle, useSharedValue, withDelay, withSpring, withTiming, type SharedValue } from 'react-native-reanimated';
import { springs } from '../tokens';
import { useReduceMotion } from '../../lib/reduceMotion';

/**
 * `true` une fois l'animation d'entrée terminée (`ms` après le montage).
 *
 * ÉCRAN NOIR DU MENU. Les onglets sont gelés quand on les quitte
 * (`freezeOnBlur`). À leur retour, React réapplique les props de son dernier
 * rendu — et pour un style animé, ce rendu porte la valeur du montage :
 * opacité 0. L'animation, finie, ne se rejoue pas : l'écran entier, ou le haut
 * du Menu (profil et quatre disques), restait noir. Une fois l'entrée jouée, le
 * composant se redessine SANS style animé : ce que React réapplique alors est
 * l'état visible.
 */
export function useEntranceDone(ms: number, reduce: boolean, p: SharedValue<number>): boolean {
  const [done, setDone] = useState(false);
  useEffect(() => {
    /*
     * LA VALEUR EST FORCÉE À 1, pas seulement le style retiré. Une entrée
     * interrompue (écran gelé, accueil occupé à charger) laissait la valeur à
     * mi-chemin, et le moteur d'animation la réappliquait : les disques
     * Envoyer / Recevoir / Swap / Gagner restaient à demi transparents, comme
     * désactivés. Fini ou interrompu, l'élément termine pleinement visible.
     */
    const settle = () => {
      cancelAnimation(p);
      p.value = 1;
      setDone(true);
    };
    if (reduce) {
      settle();
      return;
    }
    const id = setTimeout(settle, ms);
    return () => clearTimeout(id);
  }, [ms, reduce, p]);
  return done;
}

/** Monte de 18 px en apparaissant, ressort « Standard ». Utilisable sans liste. */
export function Rise({ delay = 0, children, style }: { delay?: number; children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const reduce = useReduceMotion();
  const p = useSharedValue(reduce ? 1 : 0);
  useEffect(() => {
    if (reduce) { p.value = 1; return; }
    p.value = withDelay(delay, withSpring(1, springs.gentle));
  }, [delay, reduce, p]);
  const s = useAnimatedStyle(() => ({ opacity: Math.min(1, p.value * 1.4), transform: [{ translateY: (1 - p.value) * 18 }] }));
  const done = useEntranceDone(delay + 1400, reduce, p);
  return <Animated.View style={[done ? null : s, style]}>{children}</Animated.View>;
}

/**
 * Entrée d'écran : le contenu monte de 14 px en apparaissant, une seule fois.
 * Rend `undefined` une fois l'entrée jouée (voir `useEntranceDone`).
 */
export function useScreenEntrance() {
  const reduce = useReduceMotion();
  const p = useSharedValue(reduce ? 1 : 0);
  useEffect(() => {
    if (reduce) { p.value = 1; return; }
    p.value = withTiming(1, { duration: 420, easing: Easing.out(Easing.cubic) });
  }, [reduce, p]);
  const style = useAnimatedStyle(() => ({ opacity: p.value, transform: [{ translateY: (1 - p.value) * 14 }] }));
  const done = useEntranceDone(900, reduce, p);
  return done ? undefined : style;
}
