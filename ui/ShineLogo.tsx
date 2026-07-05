/**
 * Logo Nova « premium » : trois couches animées, façon Phantom.
 *   1. Halo qui respire derrière le logo (glow doux, boucle lente).
 *   2. Le logo lion, avec une entrée ressort + fondu.
 *   3. Un éclat de lumière qui balaie le logo par intermittence — l'effet « bling ».
 *
 * 100 % Animated (transform/opacity, useNativeDriver) → fluide, aucune
 * dépendance native ajoutée. L'éclat est clippé au disque du logo (overflow).
 */
import React, { useEffect, useRef } from 'react';
import { Animated, Easing, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Defs, RadialGradient, Stop, Circle } from 'react-native-svg';
import { NovaLogo } from './NovaLogo';
import { useTheme } from './theme';

export function ShineLogo({ size = 88 }: { size?: number }) {
  const { colors } = useTheme();
  const enter = useRef(new Animated.Value(0)).current; // entrée (scale + opacity)
  const pulse = useRef(new Animated.Value(0)).current; // respiration du halo
  const sweep = useRef(new Animated.Value(0)).current; // balayage de l'éclat

  useEffect(() => {
    Animated.spring(enter, { toValue: 1, useNativeDriver: true, speed: 8, bounciness: 9 }).start();

    const breathe = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 1900, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 1900, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    );
    const shine = Animated.loop(
      Animated.sequence([
        Animated.delay(2200),
        Animated.timing(sweep, { toValue: 1, duration: 850, easing: Easing.in(Easing.ease), useNativeDriver: true }),
        Animated.timing(sweep, { toValue: 0, duration: 0, useNativeDriver: true }),
      ]),
    );
    breathe.start();
    shine.start();
    return () => {
      breathe.stop();
      shine.stop();
    };
  }, [enter, pulse, sweep]);

  const haloSize = size * 2;
  const glowScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1.15] });
  const glowOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0.65] });
  const enterScale = enter.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1] });

  // Éclat : bande diagonale claire qui traverse le disque du logo.
  const streakTranslate = sweep.interpolate({ inputRange: [0, 1], outputRange: [-size * 0.9, size * 1.4] });
  const streakOpacity = sweep.interpolate({ inputRange: [0, 0.15, 0.85, 1], outputRange: [0, 0.75, 0.75, 0] });

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      {/* 1. Halo qui respire */}
      <Animated.View
        pointerEvents="none"
        style={{ position: 'absolute', width: haloSize, height: haloSize, opacity: glowOpacity, transform: [{ scale: glowScale }] }}
      >
        <Svg width={haloSize} height={haloSize}>
          <Defs>
            <RadialGradient id="shine-halo" cx="50%" cy="50%" r="50%">
              <Stop offset="0%" stopColor={colors.accent} stopOpacity={0.8} />
              <Stop offset="55%" stopColor={colors.accent} stopOpacity={0.25} />
              <Stop offset="100%" stopColor={colors.accent} stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Circle cx={haloSize / 2} cy={haloSize / 2} r={haloSize / 2} fill="url(#shine-halo)" />
        </Svg>
      </Animated.View>

      {/* 2. Logo + 3. éclat clippé au disque */}
      <Animated.View style={{ width: size, height: size, borderRadius: size / 2, overflow: 'hidden', transform: [{ scale: enterScale }], opacity: enter }}>
        <NovaLogo size={size} />
        <Animated.View
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: -size * 0.5,
            left: 0,
            width: size * 0.5,
            height: size * 2,
            opacity: streakOpacity,
            transform: [{ translateX: streakTranslate }, { rotate: '22deg' }],
          }}
        >
          <LinearGradient
            colors={['transparent', 'rgba(255,255,255,0.85)', 'transparent']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={{ flex: 1 }}
          />
        </Animated.View>
      </Animated.View>
    </View>
  );
}
