/**
 * PAYSAGE — le ciel de l'accueil.
 *
 * Il suit l'heure de l'utilisateur (aube, jour, crépuscule, nuit : `skies` dans
 * les tokens) : ouvrir son portefeuille le soir ne ressemble pas à l'ouvrir le
 * matin. Un ciel en dégradé, un astre et son halo, trois plans de dunes.
 *
 * PROFONDEUR : au défilement, chaque plan glisse à sa propre vitesse (le ciel
 * presque immobile, la dune proche suit le doigt) — une parallaxe sur le thread
 * UI, sans aucun rendu JS. La seule animation autonome de l'écran est la
 * respiration du halo de l'astre ; « Réduire les animations » la fige.
 */
import { memo, useEffect, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { Easing, Extrapolation, cancelAnimation, interpolate, useAnimatedStyle, useSharedValue, withRepeat, withTiming, type SharedValue } from 'react-native-reanimated';
import Svg, { Circle, Defs, LinearGradient, Path, RadialGradient, Rect, Stop } from 'react-native-svg';
import { skies, type SkyPhase } from './tokens';
import { useReduceMotion } from '../lib/reduceMotion';
import { useLoopActive } from './useLoopActive';

/** Crête d'une dune : somme de deux sinusoïdes, déterministe (pas d'aléatoire au rendu). */
function dunePath(w: number, h: number, base: number, amp: number, f1: number, f2: number, phase: number): string {
  const n = 24;
  let d = `M 0 ${h} L 0 ${(base + amp * Math.sin(phase)).toFixed(1)}`;
  for (let i = 1; i <= n; i++) {
    const x = (i / n) * w;
    const u = i / n;
    const y = base + amp * (0.65 * Math.sin(u * Math.PI * f1 + phase) + 0.35 * Math.sin(u * Math.PI * f2 + phase * 1.7));
    d += ` L ${x.toFixed(1)} ${y.toFixed(1)}`;
  }
  return `${d} L ${w} ${h} Z`;
}

/** Quelques étoiles fixes (nuit, aube) : positions dérivées de l'indice. */
function stars(w: number, h: number) {
  return Array.from({ length: 26 }, (_, i) => ({ x: ((i * 137) % 101) / 101 * w, y: ((i * 61) % 47) / 47 * h * 0.5, r: i % 5 === 0 ? 1.4 : 0.8, o: 0.35 + ((i * 17) % 10) / 20 }));
}

function Layer({ scrollY, speed, height, pull = true, children }: { scrollY?: SharedValue<number>; speed: number; height: number; /** Suit le tirage vers le bas (pas le ciel : il découvrirait le fond au-dessus de lui). */ pull?: boolean; children: React.ReactNode }) {
  const style = useAnimatedStyle(() => {
    if (!scrollY) return {};
    // Défilement : le plan remonte avec le contenu, mais moins vite (le ciel presque pas,
    // la dune proche à moitié). Tirer vers le bas le fait descendre un peu.
    const y = scrollY.value;
    return { transform: [{ translateY: interpolate(y, [-200, 0, height], [pull ? 200 * speed * 0.4 : 0, 0, -height * speed], Extrapolation.CLAMP) }] };
  });
  return <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, style]}>{children}</Animated.View>;
}

export const Landscape = memo(function Landscape({ width, height, phase, scrollY }: { width: number; height: number; phase: SkyPhase; scrollY?: SharedValue<number> }) {
  const sky = skies[phase];
  const reduce = useReduceMotion();
  const active = useLoopActive();
  const breath = useSharedValue(0);
  useEffect(() => {
    if (reduce || !active) { cancelAnimation(breath); return; }
    breath.value = withRepeat(withTiming(1, { duration: 6000, easing: Easing.inOut(Easing.sin) }), -1, true);
    return () => cancelAnimation(breath);
  }, [reduce, active, breath]);
  const glow = useAnimatedStyle(() => ({ opacity: 0.75 + 0.25 * breath.value, transform: [{ scale: 1 + 0.06 * breath.value }] }));

  const night = phase === 'night';
  // L'astre est BAS, à demi posé derrière la dune lointaine : il éclaire le ciel
  // sans jamais se trouver derrière le solde (le texte occupe le haut).
  const sunR = night ? width * 0.04 : width * 0.065;
  const sunX = width * 0.8;
  const sunY = height * (night ? 0.5 : 0.6);
  const glowSize = width * 0.9;
  const paths = useMemo(() => ({
    far: dunePath(width, height, height * 0.62, height * 0.05, 2.2, 5.1, 0.6),
    mid: dunePath(width, height, height * 0.74, height * 0.06, 1.6, 3.7, 2.1),
    near: dunePath(width, height, height * 0.86, height * 0.05, 1.2, 2.9, 4.0),
    stars: night || phase === 'dawn' ? stars(width, height) : [],
  }), [width, height, night, phase]);
  if (!width || !height) return null;
  return (
    <View pointerEvents="none" style={{ position: 'absolute', left: 0, top: 0, width, height, overflow: 'hidden' }}>
      <Layer scrollY={scrollY} speed={0.15} height={height} pull={false}>
        <Svg width={width} height={height}>
          <Defs>
            <LinearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={sky.sky[0]} />
              <Stop offset="0.55" stopColor={sky.sky[1]} />
              <Stop offset="0.85" stopColor={sky.sky[2]} />
            </LinearGradient>
          </Defs>
          <Rect x={0} y={0} width={width} height={height} fill="url(#sky)" />
          {paths.stars.map((s, i) => <Circle key={i} cx={s.x} cy={s.y} r={s.r} fill="#FFFFFF" opacity={phase === 'dawn' ? s.o * 0.5 : s.o} />)}
        </Svg>
      </Layer>
      <Layer scrollY={scrollY} speed={0.25} height={height}>
        <Animated.View style={[{ position: 'absolute', left: sunX - glowSize / 2, top: sunY - glowSize / 2, width: glowSize, height: glowSize }, glow]}>
          <Svg width={glowSize} height={glowSize}>
            <Defs>
              <RadialGradient id="glow" cx="50%" cy="50%" r="50%">
                <Stop offset="0" stopColor={sky.sun} stopOpacity={night ? 0.35 : 0.6} />
                <Stop offset="0.35" stopColor={sky.sun} stopOpacity={night ? 0.1 : 0.22} />
                <Stop offset="1" stopColor={sky.sun} stopOpacity={0} />
              </RadialGradient>
            </Defs>
            <Circle cx={glowSize / 2} cy={glowSize / 2} r={glowSize / 2} fill="url(#glow)" />
          </Svg>
        </Animated.View>
        <Svg width={width} height={height} style={StyleSheet.absoluteFill}>
          <Circle cx={sunX} cy={sunY} r={sunR} fill={sky.sun} opacity={night ? 0.92 : 1} />
          <Path d={paths.far} fill={sky.dunes[0]} opacity={0.9} />
        </Svg>
      </Layer>
      <Layer scrollY={scrollY} speed={0.38} height={height}>
        <Svg width={width} height={height}><Path d={paths.mid} fill={sky.dunes[1]} /></Svg>
      </Layer>
      <Layer scrollY={scrollY} speed={0.5} height={height}>
        <Svg width={width} height={height}><Path d={paths.near} fill={sky.dunes[2]} /></Svg>
      </Layer>
      {/*
        Voile du bas : les dunes s'assombrissent vers la feuille. Il donne la
        profondeur (le premier plan est dans l'ombre) et, surtout, le contraste
        des périodes et de la courbe posées dessus, quel que soit le ciel.
      */}
      <Svg width={width} height={height} style={StyleSheet.absoluteFill}>
        <Defs>
          <LinearGradient id="veil" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0.5" stopColor="#000000" stopOpacity={0} />
            <Stop offset="1" stopColor="#000000" stopOpacity={0.32} />
          </LinearGradient>
        </Defs>
        <Rect x={0} y={0} width={width} height={height} fill="url(#veil)" />
      </Svg>
    </View>
  );
});
