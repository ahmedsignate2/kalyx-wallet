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
 *    puis le noyau apparaît. C'est LE moment de marque de l'app, et il a lieu
 *    UNE SEULE fois par lancement : sur le splash. Partout ailleurs (routage,
 *    bienvenue, réglages) le logo est déjà allumé — rejouer l'allumage toutes
 *    les deux secondes le banaliserait. La géométrie est partagée pour que les
 *    deux versions ne puissent jamais diverger.
 */
import React, { useEffect, useId } from 'react';
import Animated, { Easing, useAnimatedProps, useAnimatedStyle, useDerivedValue, useSharedValue, withDelay, withRepeat, withSpring, withTiming, type SharedValue } from 'react-native-reanimated';
import Svg, { Defs, LinearGradient, Stop, G, Rect, Circle } from 'react-native-svg';
import { springs, BRAND_GOLD } from './tokens';

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
          <Stop offset="0" stopColor={BRAND_GOLD.light} />
          <Stop offset="1" stopColor={BRAND_GOLD.deep} />
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
 * Un rayon qui JAILLIT du noyau. Chaque rayon possède son propre ressort et son
 * propre retard : c'est la seule façon d'obtenir une construction (seize gestes
 * enchaînés) plutôt qu'un balayage (une seule opacité qui glisse). Les hooks
 * Reanimated ne pouvant pas vivre dans un `.map()`, chaque rayon est un
 * composant — et ça tombe bien, c'est aussi ce qui lui donne son ressort.
 *
 * Le rayon pousse vers l'EXTÉRIEUR : son extrémité intérieure reste collée au
 * noyau (y = -(INNER + longueur)) pendant que la pointe s'éloigne. L'ancienne
 * version gardait la pointe fixe et faisait varier la hauteur : le rayon
 * grandissait vers le centre, ce qui se lit comme un effacement, pas comme une
 * naissance.
 */
function IgnitingRay({ i, gid, reduced, delay, stagger, wave }: { i: number; gid: string; reduced: boolean; delay: number; stagger: number; wave: SharedValue<number> }) {
  const r = ray(i);
  const v = useSharedValue(reduced ? 1 : 0);

  useEffect(() => {
    if (reduced) { v.value = 1; return; }
    v.value = withDelay(delay + i * stagger, withSpring(1, springs.ignite));
  }, [v, i, reduced, delay, stagger]);

  const animatedProps = useAnimatedProps(() => {
    /*
     * Onde de couronne : une SEULE valeur partagée tourne de 0 à 1 en boucle,
     * et chaque rayon en lit sa propre phase (i / RAYS). Résultat : une vague
     * de lumière qui fait le tour du soleil en permanence, pour le prix d'une
     * seule animation — pas de seize. C'est ça qui fait respirer la marque,
     * bien plus qu'une rotation.
     */
    const breath = 1 + 0.055 * Math.sin(2 * Math.PI * (wave.value + i / RAYS));
    // Le ressort dépasse 1 : on laisse le rayon déborder, c'est le « waouh ».
    const len = Math.max(0.001, r.height * v.value * breath);
    return {
      opacity: Math.min(1, v.value * 2.5),
      height: len,
      y: -(INNER + len),
    };
  });

  return (
    <AnimatedRect
      x={-RAY_WIDTH / 2}
      width={RAY_WIDTH}
      rx={RAY_WIDTH / 2}
      fill={`url(#${gid})`}
      transform={`rotate(${r.angle} 0 0)`}
      animatedProps={animatedProps}
    />
  );
}

export function KalyxLogoIgnite({
  size = 96, reduced = false, delay = 0, stagger = 32, alive = false,
}: {
  size?: number;
  reduced?: boolean;
  delay?: number;
  /** Retard entre deux rayons. 16 × stagger = durée du balayage. */
  stagger?: number;
  /**
   * Une fois allumé, le soleil continue de vivre : onde de couronne, léger
   * balancement, respiration. Réservé aux écrans où la marque EST le sujet
   * (bienvenue) — ailleurs elle deviendrait un papillotement.
   */
  alive?: boolean;
}) {
  const gid = `kalyxGoldLit-${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const core = useSharedValue(reduced ? 1 : 0);
  /** Éclosion : la marque s'ouvre au ressort en pivotant, elle ne se pose pas. */
  const bloom = useSharedValue(reduced ? 1 : 0);
  /** Onde qui fait le tour de la couronne, en continu. */
  const wave = useSharedValue(0);
  /** Balancement lent, en continu. */
  const sway = useSharedValue(0);

  useEffect(() => {
    if (reduced) { core.value = 1; bloom.value = 1; return; }
    // Le noyau s'allume EN PREMIER : c'est de lui que partent les rayons.
    core.value = withDelay(delay, withSpring(1, springs.bouncy));
    bloom.value = withDelay(delay, withSpring(1, springs.gentle));
  }, [core, bloom, reduced, delay]);

  useEffect(() => {
    if (!alive || reduced) { wave.value = 0; sway.value = 0; return; }
    // Boucle NON inversée : l'onde tourne toujours dans le même sens.
    wave.value = withRepeat(withTiming(1, { duration: 4200, easing: Easing.linear }), -1, false);
    sway.value = withRepeat(withTiming(1, { duration: 5500, easing: Easing.inOut(Easing.sin) }), -1, true);
  }, [alive, reduced, wave, sway]);

  /*
   * Le soleil s'ouvre : il part légèrement plus petit et pivoté d'un huitième
   * de rayon (-11,25° = 360/16/2, soit un demi-intervalle entre deux branches),
   * puis se cale à l'endroit au ressort. La rotation est volontairement à peine
   * lisible : elle ne doit pas se voir, elle doit se sentir — un logo qui tourne
   * franchement fait « chargement », pas « marque ».
   */
  const bloomStyle = useAnimatedStyle(() => ({
    transform: [
      // Éclosion, puis balancement permanent : ±7°, jamais un tour complet.
      // Les rayons sont plus longs en haut (l'énergie monte, cf. `ray`) ; une
      // rotation entière ferait basculer cette asymétrie vers le bas et la
      // marque se lirait de travers. Le balancement donne la vie sans coûter
      // l'identité. (Pour un tour complet : sway en boucle non inversée × 360.)
      { rotate: `${-11.25 * (1 - bloom.value) + (sway.value - 0.5) * 14}deg` },
      { scale: (0.86 + bloom.value * 0.14) * (1 + sway.value * 0.03) },
    ],
  }));

  // Le noyau pousse légèrement au-delà de sa taille avant de se poser.
  const coreScale = useDerivedValue(() => core.value);
  const coreProps = useAnimatedProps(() => ({ r: 8 * coreScale.value, opacity: Math.min(1, coreScale.value * 1.6) }));

  return (
    <Animated.View style={bloomStyle}>
      <Svg width={size} height={size} viewBox="-50 -50 100 100">
        <Defs>
          <LinearGradient id={gid} x1="0" y1="-1" x2="0" y2="1">
            <Stop offset="0" stopColor={BRAND_GOLD.light} />
            <Stop offset="1" stopColor={BRAND_GOLD.deep} />
          </LinearGradient>
        </Defs>
        <G>
          {Array.from({ length: RAYS }).map((_, i) => (
            <IgnitingRay key={i} i={i} gid={gid} reduced={reduced} delay={delay} stagger={stagger} wave={wave} />
          ))}
        </G>
        <AnimatedCircle cx={0} cy={0} fill={`url(#${gid})`} animatedProps={coreProps} />
      </Svg>
    </Animated.View>
  );
}
