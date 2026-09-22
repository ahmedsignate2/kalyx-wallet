/**
 * Logo Kalyx — marque annulaire (étoile).
 *
 * Un cercle central (le noyau) et un anneau externe de segments disposés
 * radialement avec des longueurs asymétriques (effet d'explosion, énergie
 * dirigée vers le haut).
 *
 * Deux versions :
 *  - <KalyxLogo />       : statique, partout dans l'app.
 *  - <KalyxLogoIgnite /> : les 16 rayons s'allument un par un en balayage,
 *    puis le noyau apparaît. C'est LE moment de marque de l'app (écran de
 *    bienvenue). La géométrie est partagée pour que les deux versions ne
 *    puissent jamais diverger.
 */
import React, { useEffect, useId } from 'react';
import Animated, { useAnimatedProps, useDerivedValue, useSharedValue, withSpring, withTiming, type SharedValue } from 'react-native-reanimated';
import Svg, { Defs, LinearGradient, Stop, G, Rect, Circle } from 'react-native-svg';
import { springs } from './tokens';

const RAYS = 16;
const INNER = 20;
const RAY_WIDTH = 5.5;

const AnimatedRect = Animated.createAnimatedComponent(Rect);
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

/** Géométrie d'un rayon — seule source de vérité pour les deux versions. */
function ray(i: number) {
  const angle = (360 / RAYS) * i;
  const rad = (angle * Math.PI) / 180;
  // Longueur asymétrique : plus longs en haut (proche de 0°) qu'en bas (180°).
  const outer = 38 + 6 * Math.cos(rad); // max 44 (haut), min 32 (bas)
  return { angle, outer, height: outer - INNER };
}

export function KalyxLogo({ size = 96 }: { size?: number }) {
  const gid = `kalyxGold-${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  return (
    <Svg width={size} height={size} viewBox="-50 -50 100 100">
      <Defs>
        <LinearGradient id={gid} x1="0" y1="-1" x2="0" y2="1">
          <Stop offset="0" stopColor="#DDB565" />
          <Stop offset="1" stopColor="#B8863A" />
        </LinearGradient>
      </Defs>
      <G>
        {Array.from({ length: RAYS }).map((_, i) => {
          const r = ray(i);
          return (
            <Rect
              key={i}
              x={-RAY_WIDTH / 2}
              y={-r.outer}
              width={RAY_WIDTH}
              height={r.height}
              rx={RAY_WIDTH / 2}
              fill={`url(#${gid})`}
              transform={`rotate(${r.angle} 0 0)`}
            />
          );
        })}
      </G>
      <Circle cx={0} cy={0} r={8} fill={`url(#${gid})`} />
    </Svg>
  );
}

/**
 * Un rayon qui s'allume quand le balayage `progress` (0 → 1) atteint sa
 * position. Chaque rayon est son propre composant : les hooks Reanimated ne
 * peuvent pas vivre dans un `.map()`, et ça évite 16 animations concurrentes —
 * une seule valeur partagée pilote les 16 opacités.
 */
function IgnitingRay({ i, progress, gid }: { i: number; progress: SharedValue<number>; gid: string }) {
  const r = ray(i);
  // Le balayage occupe les 75 premiers % de la progression ; chaque rayon
  // s'allume sur une fenêtre de 25 %, d'où un recouvrement qui donne une
  // traînée de lumière plutôt qu'un clignotement saccadé.
  const start = (i / RAYS) * 0.75;
  const animatedProps = useAnimatedProps(() => {
    const local = Math.min(1, Math.max(0, (progress.value - start) / 0.25));
    return { opacity: local, height: r.height * (0.55 + local * 0.45) };
  });
  return (
    <AnimatedRect
      x={-RAY_WIDTH / 2}
      y={-r.outer}
      width={RAY_WIDTH}
      rx={RAY_WIDTH / 2}
      fill={`url(#${gid})`}
      transform={`rotate(${r.angle} 0 0)`}
      animatedProps={animatedProps}
    />
  );
}

/**
 * Logo qui s'allume. `reduced` : tout est visible immédiatement, sans balayage.
 * `onLit` n'est pas nécessaire — rien dans l'écran n'attend la fin.
 */
export function KalyxLogoIgnite({ size = 96, reduced = false, delay = 0 }: { size?: number; reduced?: boolean; delay?: number }) {
  const gid = `kalyxGoldLit-${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const progress = useSharedValue(reduced ? 1 : 0);
  const core = useSharedValue(reduced ? 1 : 0);

  useEffect(() => {
    if (reduced) { progress.value = 1; core.value = 1; return; }
    const id = setTimeout(() => {
      // Balayage des rayons, puis le noyau arrive en dernier avec un rebond :
      // la lumière converge vers le centre.
      progress.value = withTiming(1, { duration: 820 });
      core.value = withSpring(1, springs.bouncy);
    }, delay);
    return () => clearTimeout(id);
  }, [progress, core, reduced, delay]);

  // Le noyau pousse légèrement au-delà de sa taille avant de se poser.
  const coreScale = useDerivedValue(() => core.value);
  const coreProps = useAnimatedProps(() => ({ r: 8 * coreScale.value, opacity: Math.min(1, coreScale.value * 1.6) }));

  return (
    <Svg width={size} height={size} viewBox="-50 -50 100 100">
      <Defs>
        <LinearGradient id={gid} x1="0" y1="-1" x2="0" y2="1">
          <Stop offset="0" stopColor="#DDB565" />
          <Stop offset="1" stopColor="#B8863A" />
        </LinearGradient>
      </Defs>
      <G>
        {Array.from({ length: RAYS }).map((_, i) => (
          <IgnitingRay key={i} i={i} progress={progress} gid={gid} />
        ))}
      </G>
      <AnimatedCircle cx={0} cy={0} fill={`url(#${gid})`} animatedProps={coreProps} />
    </Svg>
  );
}
