/**
 * Écran d'ouverture animé (à la Phantom) : fond dégradé, le lion Nova apparaît
 * (scale + légère rotation de la crinière + fondu), une vibration douce marque
 * le lancement, le mot « Nova » monte, puis l'ensemble s'efface.
 *
 * Recouvre tout au démarrage (masque aussi le flash de la 1ʳᵉ route). Appelle
 * onFinish() une fois l'animation terminée — le parent démonte alors l'overlay.
 */
import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, Vibration, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { NovaLogo } from './NovaLogo';
import { fonts, useTheme } from './theme';

export function Splash({ onFinish }: { onFinish: () => void }) {
  const { colors, gradients } = useTheme();
  const scale = useRef(new Animated.Value(0.6)).current;
  const logoOp = useRef(new Animated.Value(0)).current;
  const spin = useRef(new Animated.Value(0)).current;
  const wordOp = useRef(new Animated.Value(0)).current;
  const wordY = useRef(new Animated.Value(12)).current;
  const screenOp = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Vibration.vibrate([0, 16, 70, 22]); // tap doux de lancement
    Animated.sequence([
      // Entrée du lion (spring + fondu + petite rotation de crinière)
      Animated.parallel([
        Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 8, bounciness: 9 }),
        Animated.timing(logoOp, { toValue: 1, duration: 380, useNativeDriver: true }),
        Animated.timing(spin, { toValue: 1, duration: 620, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      ]),
      // Le mot « Nova » monte
      Animated.parallel([
        Animated.timing(wordOp, { toValue: 1, duration: 260, useNativeDriver: true }),
        Animated.timing(wordY, { toValue: 0, duration: 320, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      ]),
      Animated.delay(520),
      // Sortie
      Animated.timing(screenOp, { toValue: 0, duration: 340, easing: Easing.in(Easing.quad), useNativeDriver: true }),
    ]).start(({ finished }) => finished && onFinish());
  }, [scale, logoOp, spin, wordOp, wordY, screenOp, onFinish]);

  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['-18deg', '0deg'] });

  return (
    <Animated.View style={[StyleSheet.absoluteFill, { opacity: screenOp, zIndex: 100 }]} pointerEvents="none">
      <LinearGradient colors={gradients.screen} style={StyleSheet.absoluteFill} />
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 22 }}>
        <Animated.View style={{ opacity: logoOp, transform: [{ scale }, { rotate }] }}>
          <NovaLogo size={128} />
        </Animated.View>
        <Animated.Text
          style={{
            opacity: wordOp,
            transform: [{ translateY: wordY }],
            color: colors.text,
            fontSize: 34,
            fontFamily: fonts.extrabold,
            letterSpacing: 1,
          }}
        >
          Nova
        </Animated.Text>
      </View>
    </Animated.View>
  );
}
