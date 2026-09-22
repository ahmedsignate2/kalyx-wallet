/**
 * Halo — le seul dégradé de l'app (§2.2), en SVG radial.
 *
 * Deux rôles, distingués par la prop `aura` :
 *
 *  - SANS `aura` : une lumière décorative qui respire lentement. C'est ce qu'il
 *    était jusqu'ici, et ce qu'il reste sur les écrans où il n'est qu'un décor
 *    (fiche token, Design Lab, splash).
 *
 *  - AVEC `aura` : il DEVIENT l'Aura, l'unique indicateur d'état de l'app
 *    (docs/08 §3). Il ne respire plus « parce que c'est joli » : sa respiration
 *    dit que rien ne se passe, son flux rapide dit que Kalyx travaille, son
 *    extinction dit qu'il n'y a plus de réseau. Une seule instance à la fois
 *    (§3.4) : accueil, déverrouillage, bienvenue, pull-to-refresh. Nulle part
 *    ailleurs, sinon l'information n'en est plus une.
 *
 * Aucun écran ne pilote ce composant : il lit `lib/aura.ts`, qui reçoit les
 * événements des stores. C'est ce découplage qui permettra de remplacer le
 * dessin par Skia sans toucher à la sémantique.
 *
 * `mood` : hausse = plus lumineux, frange chaude ; baisse = plus faible, froid.
 */
import React, { useEffect } from 'react';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import Svg, { Defs, RadialGradient, Stop, Circle, Rect } from 'react-native-svg';
import { useTheme } from '../theme';
import { durations, springs } from '../tokens';
import { useAura, type AuraAmbient, type AuraPulse } from '../../lib/aura';

function useStops(mood: 'up' | 'down' | 'flat') {
  const { halo } = useTheme();
  const intensity = mood === 'up' ? 1 : mood === 'down' ? 0.55 : 0.8;
  const warm = mood === 'down' ? 'rgba(207,227,255,0.25)' : halo.stops[2];
  return { halo, intensity, warm };
}

/**
 * Comportement de chaque ambiance (§3.2). `period` est la demi-période de
 * respiration : plus elle est courte, plus le halo paraît occupé. `floor` est
 * l'opacité de base — c'est elle qui « éteint » la veille.
 */
const AMBIENT: Record<AuraAmbient, { period: number; scale: number; opacity: number; floor: number }> = {
  /** Repos : respiration lente et nette. On ne la remarque pas, on la ressent. */
  rest: { period: durations.haloBreath / 2, scale: 0.06, opacity: 0.12, floor: 1 },
  /** Synchronisation : même geste, presque trois fois plus rapide. Kalyx travaille. */
  sync: { period: 1100, scale: 0.045, opacity: 0.22, floor: 1 },
  /** Veille : presque éteint et IMMOBILE. Le hors-ligne ne respire pas. */
  offline: { period: 0, scale: 0, opacity: 0, floor: 0.28 },
};

/** Ce que joue chaque impulsion, par-dessus l'ambiance (§3.2). */
const PULSE: Record<AuraPulse, { scale: number; opacity: number }> = {
  /** Réception : expansion lumineuse — quelque chose est ARRIVÉ. */
  receive: { scale: 0.2, opacity: 0.3 },
  /** Succès : une seule impulsion, plus contenue. */
  success: { scale: 0.13, opacity: 0.25 },
  /** Erreur : micro-CONTRACTION. L'échec resserre, il ne brille pas. */
  error: { scale: -0.09, opacity: -0.18 },
  /** Ouverture : le halo s'ouvre depuis le centre. */
  unlock: { scale: 0.16, opacity: 0.2 },
};

/**
 * Cycle de respiration. Sur le thread UI, donc insensible à la charge
 * JavaScript. `amplitude` module l'intensité pour les couches larges.
 */
function useAuraStyle(amplitude: number, isAura: boolean) {
  const ambient = useAura((s) => (isAura ? s.ambient : 'rest'));
  const event = useAura((s) => (isAura ? s.event : null));
  const reduced = useReducedMotion();

  const breath = useSharedValue(0);
  /** Opacité de base, animée pour que le passage en veille soit un fondu. */
  const floor = useSharedValue(1);
  const pulseScale = useSharedValue(0);
  const pulseOpacity = useSharedValue(0);

  const cfg = AMBIENT[ambient];

  useEffect(() => {
    floor.value = withTiming(cfg.floor, { duration: durations.themeCrossfade });

    // « Réduire les animations » : chaque ambiance devient un NIVEAU FIXE (§4.4).
    // Le halo continue de dire l'état, il cesse seulement de bouger.
    if (reduced || cfg.period === 0) {
      breath.value = withTiming(reduced && ambient === 'sync' ? 1 : 0, { duration: durations.fade });
      return;
    }
    // On ne remet pas `breath` à 0 avant de relancer : la nouvelle boucle part
    // de la valeur affichée, donc aucun saut au changement d'ambiance (§4.2).
    breath.value = withRepeat(withTiming(1, { duration: cfg.period, easing: Easing.inOut(Easing.sin) }), -1, true);
  }, [breath, floor, cfg.period, cfg.floor, ambient, reduced]);

  useEffect(() => {
    if (!event) return;
    const p = PULSE[event.kind];
    if (reduced) {
      // Pas d'échelle : un bref changement d'opacité suffit à marquer le coup.
      pulseOpacity.value = withSequence(
        withTiming(Math.abs(p.opacity), { duration: durations.micro }),
        withTiming(0, { duration: durations.fade }),
      );
      return;
    }
    pulseScale.value = withSequence(withSpring(p.scale, springs.bouncy), withSpring(0, springs.gentle));
    pulseOpacity.value = withSequence(withTiming(p.opacity, { duration: durations.micro }), withTiming(0, { duration: durations.burst / 2 }));
    // `event.seq` et non `event` : une impulsion identique qui se répète doit
    // rejouer, un simple re-rendu ne doit pas.
  }, [event?.seq, event?.kind, pulseScale, pulseOpacity, reduced]);

  return useAnimatedStyle(() => ({
    transform: [{ scale: 1 + breath.value * cfg.scale * amplitude + pulseScale.value * amplitude }],
    opacity: Math.max(
      0,
      floor.value * (1 - cfg.opacity * amplitude + breath.value * cfg.opacity * amplitude) + pulseOpacity.value * amplitude,
    ),
  }));
}

/** Déclare cette instance comme l'Aura visible, et la retire au démontage. */
function useAuraPresence(isAura: boolean) {
  useEffect(() => {
    if (!isAura) return;
    useAura.getState().setVisible(true);
    return () => useAura.getState().setVisible(false);
  }, [isAura]);
}

export function Halo({
  size = 320, mood = 'flat', style, aura = false,
}: {
  size?: number;
  mood?: 'up' | 'down' | 'flat';
  style?: object;
  /** Cette instance EST l'Aura : elle reflète l'état réel de l'app (§3.4). */
  aura?: boolean;
}) {
  const { halo, intensity, warm } = useStops(mood);
  const animated = useAuraStyle(1, aura);
  useAuraPresence(aura);
  return (
    <Animated.View pointerEvents="none" style={[{ width: size, height: size, opacity: halo.opacity * intensity }, style, animated]}>
      <Svg width={size} height={size}>
        <Defs>
          <RadialGradient id="halo" cx="50%" cy="50%" r="50%">
            <Stop offset={0} stopColor={halo.stops[0]} stopOpacity={0.9} />
            <Stop offset={0.35} stopColor={halo.stops[1]} stopOpacity={0.55} />
            <Stop offset={0.7} stopColor={warm} stopOpacity={0.3} />
            <Stop offset={0.92} stopColor={halo.stops[1]} stopOpacity={0} />
            <Stop offset={1} stopColor={halo.stops[1]} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Circle cx={size / 2} cy={size / 2} r={size / 2} fill="url(#halo)" />
      </Svg>
    </Animated.View>
  );
}

/**
 * Couche pleine largeur derrière le solde. `height` = zone couverte depuis le
 * haut. Amplitude réduite de moitié : sur toute la largeur de l'écran, le même
 * mouvement devient perceptible et distrait de la lecture du solde.
 */
export function HaloBackdrop({
  mood = 'flat', height = 380, top = 0, aura = false,
}: {
  mood?: 'up' | 'down' | 'flat';
  height?: number;
  top?: number;
  aura?: boolean;
}) {
  const { halo, intensity, warm } = useStops(mood);
  const animated = useAuraStyle(0.5, aura);
  useAuraPresence(aura);
  return (
    <Animated.View pointerEvents="none" style={[{ position: 'absolute', top, left: 0, right: 0, height, opacity: halo.opacity * intensity }, animated]}>
      <Svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none">
        <Defs>
          {/* Centre en haut à droite ; rayon 45 % → transparent avant tout bord. */}
          <RadialGradient id="haloBackdrop" cx="82%" cy="28%" rx="45%" ry="45%" gradientUnits="objectBoundingBox">
            <Stop offset={0} stopColor={halo.stops[0]} stopOpacity={0.85} />
            <Stop offset={0.3} stopColor={halo.stops[1]} stopOpacity={0.5} />
            <Stop offset={0.65} stopColor={warm} stopOpacity={0.25} />
            <Stop offset={0.92} stopColor={halo.stops[1]} stopOpacity={0} />
            <Stop offset={1} stopColor={halo.stops[1]} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect x="0" y="0" width="100" height="100" fill="url(#haloBackdrop)" />
      </Svg>
    </Animated.View>
  );
}
