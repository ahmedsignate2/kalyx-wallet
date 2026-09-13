/**
 * Écran d'ouverture « particules », façon wallet haut de gamme (l'idée retenue
 * par l'utilisateur : sobre, techno, pas d'agressivité).
 *
 * Séquence (~2,5 s) :
 *   1. ~48 particules bleu/violet dispersées CONVERGENT vers le centre.
 *   2. Elles se dissolvent tandis que le logo lion se condense (petit pop).
 *   3. Une traînée lumineuse traverse l'écran.
 *   4. « KALYX » apparaît avec un halo lumineux + une vibration très douce.
 *   5. Fondu de sortie → onFinish().
 *
 * 100 % Animated (transform/opacity, useNativeDriver) : un seul driver `progress`
 * pilote toutes les particules → fluide, aucune dépendance native ajoutée.
 */
import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, Dimensions, Easing, StyleSheet, View, Vibration } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { KalyxLogo } from './KalyxLogo';
import { fonts, useTheme } from './theme';
import { haptic } from '../lib/haptics';

const { width: W } = Dimensions.get('window');
const N = 48;
const PARTICLE_COLORS = ['#7C5CFF', '#4AA8FF', '#9B7BFF', '#5CC6FF'];

interface P {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  size: number;
  color: string;
}

function makeParticles(): P[] {
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
      color: PARTICLE_COLORS[i % PARTICLE_COLORS.length],
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
  const { colors, gradients } = useTheme();
  const progress = useRef(new Animated.Value(0)).current; // convergence des particules
  const logoIn = useRef(new Animated.Value(0)).current; // condensation du logo
  const wordOp = useRef(new Animated.Value(0)).current;
  const wordY = useRef(new Animated.Value(14)).current;
  const sweep = useRef(new Animated.Value(0)).current; // traînée lumineuse
  const screenOp = useRef(new Animated.Value(1)).current;
  const particles = useMemo(makeParticles, []);

  useEffect(() => {
    Animated.sequence([
      Animated.parallel([
        Animated.timing(progress, { toValue: 1, duration: 1300, easing: Easing.inOut(Easing.cubic), useNativeDriver: true }),
        Animated.timing(sweep, { toValue: 1, duration: 1150, delay: 300, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
      // Le logo se condense (petit pop) puis « KALYX » monte.
      Animated.parallel([
        Animated.timing(logoIn, { toValue: 1, duration: 420, easing: Easing.out(Easing.back(1.6)), useNativeDriver: true }),
        Animated.sequence([
          Animated.delay(140),
          Animated.parallel([
            Animated.timing(wordOp, { toValue: 1, duration: 320, useNativeDriver: true }),
            Animated.timing(wordY, { toValue: 0, duration: 400, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
          ]),
        ]),
      ]),
      Animated.delay(560),
      Animated.timing(screenOp, { toValue: 0, duration: 360, easing: Easing.in(Easing.quad), useNativeDriver: true }),
    ]).start(({ finished }) => finished && onFinish());

    // Retour haptique léger quand le logo se forme (~1,2s).
    const t = setTimeout(() => haptic.light(), 1240);
    return () => clearTimeout(t);
  }, [progress, logoIn, wordOp, wordY, sweep, screenOp, onFinish]);

  // Le logo apparaît à mesure que les particules se condensent.
  const logoOpacity = progress.interpolate({ inputRange: [0.58, 0.9], outputRange: [0, 1], extrapolate: 'clamp' });
  const logoScaleBase = progress.interpolate({ inputRange: [0.55, 1], outputRange: [0.82, 1], extrapolate: 'clamp' });
  const logoPop = logoIn.interpolate({ inputRange: [0, 1], outputRange: [1, 1.05] });

  const sweepX = sweep.interpolate({ inputRange: [0, 1], outputRange: [-220, W + 220] });
  const sweepOpacity = sweep.interpolate({ inputRange: [0, 0.2, 0.8, 1], outputRange: [0, 0.9, 0.9, 0] });

  return (
    <Animated.View style={[StyleSheet.absoluteFill, { opacity: screenOp, zIndex: 100 }]} pointerEvents="none">
      <LinearGradient colors={gradients.screen} style={StyleSheet.absoluteFill} />

      {/* Traînée lumineuse diagonale qui traverse une fois */}
      <Animated.View
        style={{ position: 'absolute', top: 0, bottom: 0, width: 150, opacity: sweepOpacity, transform: [{ translateX: sweepX }, { rotate: '18deg' }] }}
      >
        <LinearGradient colors={['transparent', 'rgba(155,123,255,0.55)', 'transparent']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ flex: 1 }} />
      </Animated.View>

      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 26 }}>
        {/* Logo + particules (centrés) */}
        <View style={{ width: 128, height: 128, alignItems: 'center', justifyContent: 'center' }}>
          {particles.map((p, i) => (
            <Particle key={i} p={p} progress={progress} />
          ))}
          <Animated.View style={{ opacity: logoOpacity, transform: [{ scale: Animated.multiply(logoScaleBase, logoPop) }] }}>
            <KalyxLogo size={128} />
          </Animated.View>
        </View>

        {/* Wordmark « KALYX » : police de marque + halo lumineux + barre de lumière */}
        <View style={{ alignItems: 'center', gap: 12 }}>
          <Animated.Text
            style={{
              opacity: wordOp,
              transform: [{ translateY: wordY }],
              color: colors.text,
              fontSize: 40,
              fontFamily: fonts.brandStrong,
              letterSpacing: 8,
              textShadowColor: colors.accent,
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
              height: 2,
              borderRadius: 2,
              shadowColor: colors.accent,
              shadowOpacity: 0.9,
              shadowRadius: 8,
              elevation: 6,
            }}
          >
            <LinearGradient
              colors={['transparent', colors.violet, colors.blue, 'transparent']}
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
