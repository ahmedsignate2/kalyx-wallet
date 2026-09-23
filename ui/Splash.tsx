/**
 * Écran d'ouverture « particules », façon wallet haut de gamme (l'idée retenue
 * par l'utilisateur : sobre, techno, pas d'agressivité).
 *
 * Séquence (~1,6 s — bible §7 : froid < 2 s). Elle ne joue QUE pour un
 * utilisateur qui revient : au premier lancement, l'écran de bienvenue est
 * lui-même l'ouverture (cf. app/_layout.tsx).
 *   1. ~48 particules bleu/violet dispersées CONVERGENT vers le centre.
 *   2. Elles se dissolvent tandis que les 16 rayons du logo S'ALLUMENT un par
 *      un : la lumière dispersée se rassemble dans la marque.
 *   3. Le halo naît d'un point AU MÊME INSTANT que l'allumage, et une traînée
 *      lumineuse traverse l'écran.
 *   4. « KALYX » apparaît avec un halo lumineux (pas de vibration : l'haptique répond à une action, §3).
 *   5. Fondu de sortie → onFinish().
 *
 * 100 % Animated (transform/opacity, useNativeDriver) : un seul driver `progress`
 * pilote toutes les particules → fluide, aucune dépendance native ajoutée.
 */
import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, Dimensions, Easing, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { KalyxLogoIgnite } from './KalyxLogo';
import { Halo } from './kit/Halo';
import { splashParticles, splashSweep, BRAND_GOLD } from './tokens';
import { fonts, useTheme } from './theme';

const { width: W } = Dimensions.get('window');
const N = 48;

/*
 * Géométrie de la pile centrale, en constantes nommées : l'écran de routage
 * (app/index.tsx) pose le MÊME logo, à la MÊME place, pendant que le splash
 * s'efface. Sans ça, le fondu révèle un logo décalé de quelques dizaines de
 * pixels — un sursaut, exactement ce qu'on cherche à supprimer.
 */
export const SPLASH_LOGO_SIZE = 128;
const STACK_GAP = 26;
const WORD_LINE = 48;
const WORD_GAP = 12;
const BAR_H = 2;
/** De combien le logo est remonté par rapport au centre de l'écran. */
export const SPLASH_LOGO_LIFT = (STACK_GAP + WORD_LINE + WORD_GAP + BAR_H) / 2;
// Couleurs du halo (ui/tokens.ts) : blanc, glacier, frange chaude — pas de violet (§2).
const PARTICLE_COLORS = ['#FFFFFF', '#CFE3FF', '#FFD9B8', '#E6EEFF'];

interface P {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  size: number;
  color: string;
}

function makeParticles(palette: readonly string[]): P[] {
  const arr: P[] = [];
  for (let i = 0; i < N; i++) {
    const a = Math.random() * Math.PI * 2;
    const rOut = 120 + Math.random() * 170; // départ dispersé
    const a2 = Math.random() * Math.PI * 2;
    const rIn = Math.random() * 48; // arrivée condensée sur le logo
    arr.push({
      x0: Math.cos(a) * rOut,
      y0: Math.sin(a) * rOut,
      x1: Math.cos(a2) * rIn,
      y1: Math.sin(a2) * rIn,
      size: 3 + Math.random() * 3.5,
      color: palette[i % palette.length],
    });
  }
  return arr;
}

function Particle({ p, progress }: { p: P; progress: Animated.Value }) {
  const translateX = progress.interpolate({ inputRange: [0, 1], outputRange: [p.x0, p.x1] });
  const translateY = progress.interpolate({ inputRange: [0, 1], outputRange: [p.y0, p.y1] });
  const opacity = progress.interpolate({ inputRange: [0, 0.12, 0.68, 0.92], outputRange: [0, 1, 1, 0], extrapolate: 'clamp' });
  const scale = progress.interpolate({ inputRange: [0, 0.7, 1], outputRange: [1, 1, 0.4] });
  return (
    <Animated.View
      style={{
        position: 'absolute',
        left: '50%',
        top: '50%',
        width: p.size,
        height: p.size,
        borderRadius: p.size / 2,
        backgroundColor: p.color,
        opacity,
        transform: [{ translateX }, { translateY }, { scale }],
      }}
    />
  );
}

export function Splash({ onFinish }: { onFinish: () => void }) {
  const { mode, colors, gradients } = useTheme();
  const progress = useRef(new Animated.Value(0)).current; // convergence des particules
  const logoIn = useRef(new Animated.Value(0)).current; // condensation du logo
  const wordOp = useRef(new Animated.Value(0)).current;
  const wordY = useRef(new Animated.Value(14)).current;
  const sweep = useRef(new Animated.Value(0)).current; // traînée lumineuse
  const screenOp = useRef(new Animated.Value(1)).current;
  const particles = useMemo(() => makeParticles(splashParticles[mode]), [mode]);

  useEffect(() => {
    Animated.sequence([
      // Une seule phase parallèle : tout s'enchaîne, rien ne se succède par
      // blocs. C'est ce qui distingue une séquence d'un diaporama.
      Animated.parallel([
        // 0 → 700 : les particules convergent vers le centre.
        Animated.timing(progress, { toValue: 1, duration: 700, easing: Easing.inOut(Easing.cubic), useNativeDriver: true }),
        // 260 → 960 : la traînée traverse.
        Animated.timing(sweep, { toValue: 1, duration: 700, delay: 260, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        // 380 → 1000 : le HALO naît d'un point exactement quand les rayons
        // s'allument. Le halo n'est pas le décor de l'écran suivant : il fait
        // partie de l'allumage, c'est la chaleur que dégage la marque.
        Animated.timing(logoIn, { toValue: 1, duration: 780, delay: 380, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        // 560 → 1020 : « KALYX » monte. Fondu + translation + échelle, et une
        // sortie cubique longue : le mot se dépose, il ne surgit pas.
        Animated.sequence([
          Animated.delay(700),
          Animated.parallel([
            Animated.timing(wordOp, { toValue: 1, duration: 380, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
            Animated.timing(wordY, { toValue: 0, duration: 460, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
          ]),
        ]),
      ]),
      Animated.delay(160),
      Animated.timing(screenOp, { toValue: 0, duration: 260, easing: Easing.in(Easing.quad), useNativeDriver: true }),
    ]).start(({ finished }) => finished && onFinish());
  }, [progress, logoIn, wordOp, wordY, sweep, screenOp, onFinish]);

  // Naissance du halo : d'un point, EN MÊME TEMPS que les rayons s'allument.
  // Le halo n'est plus un décor de l'écran suivant, il fait partie de l'allumage.
  const haloScale = logoIn.interpolate({ inputRange: [0, 1], outputRange: [0.15, 1] });
  const haloOpacity = logoIn.interpolate({ inputRange: [0, 0.4, 1], outputRange: [0, 0.7, 1] });

  const wordScale = wordOp.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1] });

  const sweepX = sweep.interpolate({ inputRange: [0, 1], outputRange: [-220, W + 220] });
  const sweepOpacity = sweep.interpolate({ inputRange: [0, 0.2, 0.8, 1], outputRange: [0, 0.9, 0.9, 0] });

  return (
    <Animated.View style={[StyleSheet.absoluteFill, { opacity: screenOp, zIndex: 100 }]} pointerEvents="none">
      <LinearGradient colors={gradients.screen} style={StyleSheet.absoluteFill} />

      {/* Traînée lumineuse diagonale qui traverse une fois */}
      <Animated.View
        style={{ position: 'absolute', top: 0, bottom: 0, width: 150, opacity: sweepOpacity, transform: [{ translateX: sweepX }, { rotate: '18deg' }] }}
      >
        <LinearGradient colors={['transparent', splashSweep[mode], 'transparent']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ flex: 1 }} />
      </Animated.View>

      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: STACK_GAP }}>
        {/* Logo + particules (centrés) */}
        <View style={{ width: SPLASH_LOGO_SIZE, height: SPLASH_LOGO_SIZE, alignItems: 'center', justifyContent: 'center' }}>
          <Animated.View style={{ position: 'absolute', opacity: haloOpacity, transform: [{ scale: haloScale }] }}>
            <Halo size={300} mood="up" />
          </Animated.View>
          {particles.map((p, i) => (
            <Particle key={i} p={p} progress={progress} />
          ))}
          {/*
            Le logo ne « s'affiche » plus : il S'ALLUME rayon par rayon pendant
            que les particules convergent — la lumière dispersée se rassemble
            dans la marque. L'allumage démarre à 380 ms (quand les premières
            particules arrivent) et dure 620 ms.
          */}
          <KalyxLogoIgnite size={SPLASH_LOGO_SIZE} delay={380} stagger={44} />
        </View>

        {/* Wordmark « KALYX » : police de marque + halo lumineux + barre de lumière */}
        <View style={{ alignItems: 'center', gap: WORD_GAP }}>
          <Animated.Text
            style={{
              opacity: wordOp,
              transform: [{ translateY: wordY }, { scale: wordScale }],
              color: colors.text,
              fontSize: 40,
              lineHeight: WORD_LINE,
              fontFamily: fonts.brandStrong,
              letterSpacing: 8,
              textShadowColor: BRAND_GOLD.light,
              textShadowOffset: { width: 0, height: 0 },
              textShadowRadius: 18,
            }}
          >
            KALYX
          </Animated.Text>
          {/* Trait lumineux qui s'ouvre sous le mot (frames 8/9 du storyboard). */}
          <Animated.View
            style={{
              opacity: wordOp,
              transform: [{ scaleX: wordOp.interpolate({ inputRange: [0, 1], outputRange: [0.2, 1] }) }],
              width: 150,
              height: BAR_H,
              borderRadius: 2,
              shadowColor: BRAND_GOLD.light,
              shadowOpacity: 0.9,
              shadowRadius: 8,
              elevation: 6,
            }}
          >
            <LinearGradient
              colors={['transparent', BRAND_GOLD.light, BRAND_GOLD.deep, 'transparent']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={{ flex: 1, borderRadius: 2 }}
            />
          </Animated.View>
        </View>
      </View>
    </Animated.View>
  );
}
