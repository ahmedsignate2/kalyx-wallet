/**
 * Saisie de PIN « premium » : ronds animés + pavé numérique en relief (dégradé
 * + ombre), retour haptique par touche, secousse à l'erreur.
 *
 * Deux modes de ronds :
 * - `expectedLength` connu (option « app bancaire ») → on affiche EXACTEMENT ce
 *   nombre de ronds vides qui se remplissent ; auto-validation quand c'est plein ;
 * - sinon → affichage progressif : un rond apparaît à chaque chiffre (aucune
 *   longueur imposée), l'appelant valide via un bouton.
 */
import React, { useEffect, useRef } from 'react';
import { Animated, Pressable, Text, Vibration, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { fonts, radii, spacing, useTheme } from './theme';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

export function PinPad({
  value,
  onChange,
  minLength = 6,
  maxLength = 12,
  expectedLength,
  onComplete,
  disabled,
  errorSignal,
  bottomLeft,
}: {
  value: string;
  onChange: (v: string) => void;
  minLength?: number;
  maxLength?: number;
  /** Longueur connue du PIN → ronds exacts + auto-validation. */
  expectedLength?: number;
  /** Appelé quand la saisie atteint expectedLength (auto-validation). */
  onComplete?: (v: string) => void;
  disabled?: boolean;
  /** Change de valeur pour déclencher la secousse (ex. compteur d'erreurs). */
  errorSignal?: number;
  /** Élément en bas à gauche du pavé (rarement utilisé — bio est au-dessus). */
  bottomLeft?: React.ReactNode;
}) {
  const { colors, gradients } = useTheme();
  const shake = useRef(new Animated.Value(0)).current;
  const cap = expectedLength ? Math.min(expectedLength, maxLength) : maxLength;

  useEffect(() => {
    if (!errorSignal) return;
    Vibration.vibrate(90);
    Animated.sequence([
      Animated.timing(shake, { toValue: 10, duration: 45, useNativeDriver: true }),
      Animated.timing(shake, { toValue: -10, duration: 45, useNativeDriver: true }),
      Animated.timing(shake, { toValue: 6, duration: 45, useNativeDriver: true }),
      Animated.timing(shake, { toValue: 0, duration: 45, useNativeDriver: true }),
    ]).start();
  }, [errorSignal, shake]);

  const press = (digit: string) => {
    if (disabled || value.length >= cap) return;
    Vibration.vibrate(8);
    const next = value + digit;
    onChange(next);
    if (expectedLength && next.length === expectedLength) {
      // Laisse le dernier rond se remplir avant de valider.
      setTimeout(() => onComplete?.(next), 120);
    }
  };
  const back = () => {
    if (disabled || !value.length) return;
    Vibration.vibrate(8);
    onChange(value.slice(0, -1));
  };

  // Nb de ronds : exact si connu, sinon progressif (min 1 dès la 1ʳᵉ frappe).
  const dotCount = expectedLength ?? Math.max(1, Math.min(cap, value.length));

  return (
    <View style={{ alignItems: 'center', gap: spacing(4) }}>
      {/* Ronds */}
      <Animated.View style={{ flexDirection: 'row', gap: spacing(1.75), transform: [{ translateX: shake }], minHeight: 20 }}>
        {Array.from({ length: dotCount }).map((_, i) => (
          <Dot key={i} filled={i < value.length} />
        ))}
      </Animated.View>

      {/* Pavé numérique */}
      <View style={{ width: 300, flexDirection: 'row', flexWrap: 'wrap', gap: spacing(1.75), justifyContent: 'center' }}>
        {KEYS.map((k) => (
          <Key key={k} label={k} onPress={() => press(k)} disabled={disabled} gradient={gradients.accent} />
        ))}
        <View style={{ width: 78, height: 78, alignItems: 'center', justifyContent: 'center' }}>{bottomLeft}</View>
        <Key label="0" onPress={() => press('0')} disabled={disabled} gradient={gradients.accent} />
        <Pressable
          onPress={back}
          disabled={disabled || !value.length}
          hitSlop={6}
          style={({ pressed }) => ({ width: 78, height: 78, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.5 : value.length ? 1 : 0.3 })}
        >
          <Text style={{ color: colors.text, fontSize: 32 }}>⌫</Text>
        </Pressable>
      </View>
    </View>
  );
}

/** Rond du PIN : « pop » (scale) au remplissage. */
function Dot({ filled }: { filled: boolean }) {
  const { colors } = useTheme();
  const s = useRef(new Animated.Value(filled ? 1 : 0)).current;
  useEffect(() => {
    Animated.spring(s, { toValue: filled ? 1 : 0, useNativeDriver: true, speed: 20, bounciness: 14 }).start();
  }, [filled, s]);
  const scale = s.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1] });
  return (
    <View style={{ width: 16, height: 16, borderRadius: 8, borderWidth: 1.5, borderColor: colors.glassBorder, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View style={{ width: 16, height: 16, borderRadius: 8, backgroundColor: colors.accent, opacity: s, transform: [{ scale }] }} />
    </View>
  );
}

/** Touche du pavé : léger relief (dégradé de surface + ombre douce). */
function Key({ label, onPress, disabled, gradient }: { label: string; onPress: () => void; disabled?: boolean; gradient: readonly [string, string, ...string[]] }) {
  const { colors, mode, shadow } = useTheme();
  // Surface légèrement dégradée pour le volume (plus clair en haut).
  const surface: readonly [string, string] =
    mode === 'dark' ? ['rgba(255,255,255,0.10)', 'rgba(255,255,255,0.03)'] : ['#FFFFFF', '#EEF1F8'];
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => ({ width: 78, height: 78, borderRadius: radii.pill, transform: [{ scale: pressed ? 0.94 : 1 }] })}
    >
      <LinearGradient
        colors={surface}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={[
          {
            width: 78,
            height: 78,
            borderRadius: radii.pill,
            alignItems: 'center',
            justifyContent: 'center',
            borderWidth: 1,
            borderColor: colors.glassBorder,
          },
          shadow.card,
        ]}
      >
        <Text style={{ color: colors.text, fontSize: 27, fontFamily: fonts.semibold }}>{label}</Text>
      </LinearGradient>
    </Pressable>
  );
}
