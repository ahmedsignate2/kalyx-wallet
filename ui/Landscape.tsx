/**
 * PAYSAGE — le ciel de l'accueil, et les dunes de scène des autres écrans.
 *
 * Il suit l'heure de l'utilisateur (aube, jour, crépuscule, nuit) : ouvrir son
 * portefeuille le soir ne ressemble pas à l'ouvrir le matin.
 *
 * LA MATIÈRE. Pas des vagues plates : des collines ARRONDIES (sommes de
 * gaussiennes, lissées en courbes de Bézier), chacune dans un dégradé lumière →
 * ombre éclairé du côté de l'astre, avec un liseré de lumière sur la crête. Une
 * brume de la couleur de l'horizon sépare les plans (profondeur
 * atmosphérique), un halo entoure l'astre. Tout est vectoriel : net sur tous
 * les écrans, rien à télécharger.
 *
 * PROFONDEUR : au défilement, chaque plan glisse à sa propre vitesse (le ciel
 * presque immobile, la colline proche suit le doigt) — une parallaxe sur le
 * thread UI, sans aucun rendu JS. La seule animation autonome de l'écran est la
 * respiration du halo de l'astre ; « Réduire les animations » la fige.
 */
import { memo, useEffect, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { Easing, Extrapolation, cancelAnimation, interpolate, useAnimatedStyle, useSharedValue, withRepeat, withTiming, type SharedValue } from 'react-native-reanimated';
import Svg, { Circle, Defs, G, LinearGradient, Path, RadialGradient, Rect, Stop } from 'react-native-svg';
import { dark as darkPalette, light as lightPalette, type SkyPhase } from './tokens';
import { hillPaths, SCENE_DUNES, SCENES, stars, type Hill } from './landscapeScene';
import { useReduceMotion } from '../lib/reduceMotion';
import { useLoopActive } from './useLoopActive';

/* ------------------------------------------------------------------ */
/* Briques de rendu                                                    */
/* ------------------------------------------------------------------ */

/** Une colline : dégradé lumière (en haut à droite, côté astre) → ombre (en bas à gauche), liseré de crête. */
function HillShape({ id, w, h, hill, rimOpacity = 0.35 }: { id: string; w: number; h: number; hill: Hill; rimOpacity?: number }) {
  const p = useMemo(() => hillPaths(w, h, hill), [w, h, hill]);
  return (
    <>
      <Defs>
        <LinearGradient id={id} x1="0.9" y1="0" x2="0.1" y2="1">
          <Stop offset="0" stopColor={hill.lit} />
          <Stop offset="1" stopColor={hill.shadow} />
        </LinearGradient>
      </Defs>
      <Path d={p.fill} fill={`url(#${id})`} />
      <Path d={p.rim} fill="none" stroke="#FFFFFF" strokeOpacity={rimOpacity * 0.45} strokeWidth={1} />
    </>
  );
}

/** Brume de l'horizon entre deux plans : une bande diffuse, la profondeur. */
function Haze({ id, w, h, color, from, to, opacity }: { id: string; w: number; h: number; color: string; from: number; to: number; opacity: number }) {
  return (
    <>
      <Defs>
        <LinearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={color} stopOpacity={0} />
          <Stop offset="0.6" stopColor={color} stopOpacity={opacity} />
          <Stop offset="1" stopColor={color} stopOpacity={0} />
        </LinearGradient>
      </Defs>
      <Rect x={0} y={from * h} width={w} height={(to - from) * h} fill={`url(#${id})`} />
    </>
  );
}

function Layer({ scrollY, speed, height, pull = true, children }: { scrollY?: SharedValue<number>; speed: number; height: number; /** Suit le tirage vers le bas (pas le ciel : il découvrirait le fond au-dessus de lui). */ pull?: boolean; children: React.ReactNode }) {
  const style = useAnimatedStyle(() => {
    if (!scrollY) return {};
    // Défilement : le plan remonte avec le contenu, mais moins vite (le ciel presque pas,
    // la colline proche à moitié). Tirer vers le bas le fait descendre un peu.
    const y = scrollY.value;
    return { transform: [{ translateY: interpolate(y, [-200, 0, height], [pull ? 200 * speed * 0.4 : 0, 0, -height * speed], Extrapolation.CLAMP) }] };
  });
  return <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, style]}>{children}</Animated.View>;
}

/* ------------------------------------------------------------------ */
/* Le paysage                                                          */
/* ------------------------------------------------------------------ */

export const Landscape = memo(function Landscape({ width, height, phase, scrollY, sunAt, sunX: sunXAt, veil, balanceGlow }: { width: number; height: number; phase: SkyPhase; scrollY?: SharedValue<number>; /** Hauteur de l'astre (fraction de `height`) : un paysage plein écran le pose sur l'horizon, loin du texte. */ sunAt?: number; /** Position horizontale de l'astre (fraction de `width`, 0,74 par défaut). */ sunX?: number; /** Voile sombre sur le bas : ce qui est posé sur les collines (courbe, périodes) garde son contraste. */ veil?: boolean; /** Halo chaud derrière le solde (en haut à gauche), plus présent en Nuit. */ balanceGlow?: number }) {
  const sc = SCENES[phase];
  const reduce = useReduceMotion();
  const active = useLoopActive();
  const breath = useSharedValue(0);
  useEffect(() => {
    if (reduce || !active) { cancelAnimation(breath); return; }
    breath.value = withRepeat(withTiming(1, { duration: 6000, easing: Easing.inOut(Easing.sin) }), -1, true);
    return () => cancelAnimation(breath);
  }, [reduce, active, breath]);
  const glow = useAnimatedStyle(() => ({ opacity: 0.8 + 0.2 * breath.value, transform: [{ scale: 1 + 0.05 * breath.value }] }));

  const night = phase === 'night';
  // L'astre est BAS, posé derrière la colline lointaine (à droite) : il éclaire le
  // ciel et les crêtes, sans jamais se trouver derrière le solde.
  const sunR = night ? width * 0.035 : width * 0.05;
  const sunX = width * (sunXAt ?? 0.74);
  const sunY = height * (sunAt ?? 0.5);
  const glowSize = width * 1.1;
  const starList = useMemo(() => (sc.stars ? stars(width, height) : []), [sc.stars, width, height]);
  if (!width || !height) return null;
  const [far, back, mid, near] = sc.hills;
  return (
    <View pointerEvents="none" style={{ position: 'absolute', left: 0, top: 0, width, height, overflow: 'hidden' }}>
      <Layer scrollY={scrollY} speed={0.12} height={height} pull={false}>
        <Svg width={width} height={height}>
          <Defs>
            <LinearGradient id="ls-sky" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={sc.sky[0]} />
              <Stop offset="0.5" stopColor={sc.sky[1]} />
              <Stop offset="0.8" stopColor={sc.sky[2]} />
            </LinearGradient>
          </Defs>
          <Rect x={0} y={0} width={width} height={height} fill="url(#ls-sky)" />
          {balanceGlow ? (
            <>
              <Defs>
                <RadialGradient id="ls-bal" cx="28%" cy="30%" rx="62%" ry="34%">
                  <Stop offset="0" stopColor={sc.glow} stopOpacity={balanceGlow} />
                  <Stop offset="1" stopColor={sc.glow} stopOpacity={0} />
                </RadialGradient>
              </Defs>
              <Rect x={0} y={0} width={width} height={height} fill="url(#ls-bal)" />
            </>
          ) : null}
          {starList.map((s, i) => <Circle key={i} cx={s.x} cy={s.y} r={s.r} fill="#FFFFFF" opacity={phase === 'night' ? s.o : s.o * 0.45} />)}
        </Svg>
      </Layer>
      {/* L'astre et son halo, qui respire lentement. */}
      <Layer scrollY={scrollY} speed={0.2} height={height}>
        <Animated.View style={[{ position: 'absolute', left: sunX - glowSize / 2, top: sunY - glowSize / 2, width: glowSize, height: glowSize }, glow]}>
          <Svg width={glowSize} height={glowSize}>
            <Defs>
              <RadialGradient id="ls-glow" cx="50%" cy="50%" r="50%">
                <Stop offset="0" stopColor={sc.glow} stopOpacity={night ? 0.4 : 0.75} />
                <Stop offset="0.3" stopColor={sc.glow} stopOpacity={night ? 0.14 : 0.3} />
                <Stop offset="1" stopColor={sc.glow} stopOpacity={0} />
              </RadialGradient>
            </Defs>
            <Circle cx={glowSize / 2} cy={glowSize / 2} r={glowSize / 2} fill="url(#ls-glow)" />
          </Svg>
        </Animated.View>
        <Svg width={width} height={height} style={StyleSheet.absoluteFill}>
          <Circle cx={sunX} cy={sunY} r={sunR} fill={sc.sun} />
        </Svg>
      </Layer>
      <Layer scrollY={scrollY} speed={0.28} height={height}>
        <Svg width={width} height={height}>
          <HillShape id="ls-h0" w={width} h={height} hill={far} rimOpacity={0.45} />
          <Haze id="ls-z0" w={width} h={height} color={sc.haze} from={0.5} to={0.86} opacity={0.32} />
        </Svg>
      </Layer>
      <Layer scrollY={scrollY} speed={0.36} height={height}>
        <Svg width={width} height={height}>
          <HillShape id="ls-h1" w={width} h={height} hill={back} rimOpacity={0.22} />
        </Svg>
      </Layer>
      <Layer scrollY={scrollY} speed={0.44} height={height}>
        <Svg width={width} height={height}>
          <Haze id="ls-z1" w={width} h={height} color={sc.haze} from={0.62} to={0.92} opacity={0.22} />
          <HillShape id="ls-h2" w={width} h={height} hill={mid} rimOpacity={0.4} />
        </Svg>
      </Layer>
      <Layer scrollY={scrollY} speed={0.52} height={height}>
        <Svg width={width} height={height}>
          <HillShape id="ls-h3" w={width} h={height} hill={near} rimOpacity={0.5} />
        </Svg>
      </Layer>
      {veil ? (
        <Svg width={width} height={height} style={StyleSheet.absoluteFill}>
          <Defs>
            <LinearGradient id="ls-veil" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0.42" stopColor="#0B0A18" stopOpacity={0} />
              <Stop offset="1" stopColor="#0B0A18" stopOpacity={0.5} />
            </LinearGradient>
          </Defs>
          <Rect x={0} y={0} width={width} height={height} fill="url(#ls-veil)" />
        </Svg>
      ) : null}
    </View>
  );
});

/* ------------------------------------------------------------------ */
/* Dunes de scène — le décor des écrans secondaires                   */
/* ------------------------------------------------------------------ */


/**
 * DUNES DE SCÈNE : le paysage de l'accueil, en écho, sur tous les autres
 * écrans. `top` : derrière l'en-tête, les collines se fondent vers le bas dans
 * le fond de l'écran. `bottom` : posées au pied de l'écran, sous l'action
 * principale. Immobiles : un décor, pas une animation.
 */
export const SceneDunes = memo(function SceneDunes({ width, height, position = 'top', mode }: { width: number; height: number; position?: 'top' | 'bottom'; mode: 'light' | 'dark' }) {
  const p = SCENE_DUNES[mode];
  const bg = mode === 'dark' ? darkPalette.bg : lightPalette.bg;
  const top = position === 'top';
  // Dans le bandeau du haut, les collines sont plus basses (le titre est au-dessus).
  // En haut, elles sont aussi remontées dans le bandeau : le fondu vers le fond ne doit pas les effacer.
  const shapes = useMemo(() => p.hills.map((hh) => ({ ...hh, base: hh.base - (top ? 0.2 : 0), peaks: hh.peaks.map(([cx, amp, s]) => [cx, amp * (top ? 0.75 : 1), s] as const) })), [p, top]);
  if (!width || !height) return null;
  const id = `sd-${mode}-${position}`;
  return (
    <View pointerEvents="none" style={[{ position: 'absolute', left: 0, width, height }, top ? { top: 0 } : { bottom: 0 }]}>
      <Svg width={width} height={height}>
        <Defs>
          <LinearGradient id={`${id}-wash`} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={p.wash} stopOpacity={top ? 1 : 0} />
            <Stop offset="1" stopColor={p.wash} stopOpacity={top ? 0.2 : 0.7} />
          </LinearGradient>
          {/* Fondu final vers le fond de l'écran : le contenu ne se pose jamais sur une arête. */}
          <LinearGradient id={`${id}-fade`} x1="0" y1="0" x2="0" y2="1">
            <Stop offset={top ? 0.7 : 0} stopColor={bg} stopOpacity={top ? 0 : 0.9} />
            <Stop offset={top ? 1 : 0.35} stopColor={bg} stopOpacity={top ? 1 : 0} />
          </LinearGradient>
        </Defs>
        <Rect x={0} y={0} width={width} height={height} fill={`url(#${id}-wash)`} />
        {/* En haut d'écran Nuit, les collines s'effacent à moitié : le texte crème posé dessus reste lisible. */}
        <G opacity={top && mode === 'dark' ? 0.5 : 1}>
        <HillShape id={`${id}-h0`} w={width} h={height} hill={shapes[0]} rimOpacity={0.5} />
        <Haze id={`${id}-z0`} w={width} h={height} color={p.haze} from={0.45} to={0.85} opacity={mode === 'dark' ? 0.25 : 0.35} />
        <HillShape id={`${id}-h1`} w={width} h={height} hill={shapes[1]} rimOpacity={0.35} />
        <HillShape id={`${id}-h2`} w={width} h={height} hill={shapes[2]} rimOpacity={0.45} />
        <HillShape id={`${id}-h3`} w={width} h={height} hill={shapes[3]} rimOpacity={0.5} />
        </G>
        <Rect x={0} y={0} width={width} height={height} fill={`url(#${id}-fade)`} />
      </Svg>
    </View>
  );
});
