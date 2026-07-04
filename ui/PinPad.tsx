/**
 * Saisie de PIN « premium » : points animés + pavé numérique maison avec retour
 * haptique, secousse à l'erreur. Remplace le TextInput brut. Réutilisable
 * (déverrouillage, création/changement de PIN).
 *
 * Le PIN Nova fait 6 à 12 chiffres → pas d'auto-validation à 6 : les points
 * sont dynamiques et l'appelant décide quand valider (bouton actif à ≥ 6).
 */
import React, { useEffect, useRef } from 'react';
import { Animated, Pressable, Text, Vibration, View } from 'react-native';
import { fonts, radii, spacing, useTheme } from './theme';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

export function PinPad({
  value,
  onChange,
  minLength = 6,
  maxLength = 12,
  disabled,
  errorSignal,
  bottomLeft,
}: {
  value: string;
  onChange: (v: string) => void;
  minLength?: number;
  maxLength?: number;
  disabled?: boolean;
  /** Change de valeur pour déclencher la secousse (ex. compteur d'erreurs). */
  errorSignal?: number;
  /** Élément en bas à gauche du pavé (ex. bouton biométrie). */
  bottomLeft?: React.ReactNode;
}) {
  const { colors } = useTheme();
  const shake = useRef(new Animated.Value(0)).current;

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
    if (disabled || value.length >= maxLength) return;
    Vibration.vibrate(8);
    onChange(value + digit);
  };
  const back = () => {
    if (disabled || !value.length) return;
    Vibration.vibrate(8);
    onChange(value.slice(0, -1));
  };

  const dotCount = Math.min(maxLength, Math.max(minLength, value.length));

  return (
    <View style={{ alignItems: 'center', gap: spacing(4) }}>
      {/* Points */}
      <Animated.View style={{ flexDirection: 'row', gap: spacing(1.5), transform: [{ translateX: shake }] }}>
        {Array.from({ length: dotCount }).map((_, i) => {
          const filled = i < value.length;
          return (
            <View
              key={i}
              style={{
                width: 13,
                height: 13,
                borderRadius: 7,
                backgroundColor: filled ? colors.accent : 'transparent',
                borderWidth: filled ? 0 : 1.5,
                borderColor: colors.glassBorder,
              }}
            />
          );
        })}
      </Animated.View>

      {/* Pavé numérique */}
      <View style={{ width: 280, flexDirection: 'row', flexWrap: 'wrap', gap: spacing(1.5), justifyContent: 'center' }}>
        {KEYS.map((k) => (
          <Key key={k} label={k} onPress={() => press(k)} disabled={disabled} />
        ))}
        <View style={{ width: 76, height: 76, alignItems: 'center', justifyContent: 'center' }}>{bottomLeft}</View>
        <Key label="0" onPress={() => press('0')} disabled={disabled} />
        <Pressable
          onPress={back}
          disabled={disabled || !value.length}
          style={({ pressed }) => ({ width: 76, height: 76, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.5 : value.length ? 1 : 0.35 })}
        >
          <Text style={{ color: colors.textMuted, fontSize: 26 }}>⌫</Text>
        </Pressable>
      </View>
    </View>
  );
}

function Key({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => ({
        width: 76,
        height: 76,
        borderRadius: radii.pill,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: pressed ? colors.glassStrong : colors.glass,
        borderWidth: 1,
        borderColor: colors.glassBorder,
      })}
    >
      <Text style={{ color: colors.text, fontSize: 26, fontFamily: fonts.semibold }}>{label}</Text>
    </Pressable>
  );
}
