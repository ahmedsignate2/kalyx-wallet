/**
 * Saisie de PIN : anneau de progression + pavé numérique, retour haptique par
 * touche, secousse à l'erreur.
 *
 * Nettoyé à l'étape 2 (docs/08 §18, §7.2) :
 *  - les touches étaient dessinées avec un LinearGradient « pour le volume ».
 *    Un dégradé décoratif est précisément ce que le §18 interdit : le relief
 *    vient du contraste de la surface, pas d'une fausse lumière peinte dessus ;
 *  - un composant `Dot` et ses trois variables de taille étaient calculés à
 *    chaque rendu sans jamais être affichés — l'anneau les avait remplacés.
 *    Code mort supprimé ;
 *  - la touche s'enfonce au RESSORT au lieu de sauter d'un état à l'autre, et
 *    respecte « réduire les animations » ;
 *  - alias de thème hérités (`glassBorder`, `accent`) remplacés par les tokens.
 *
 * `expectedLength` connu → auto-validation quand c'est plein ; sinon l'appelant
 * valide via un bouton.
 */
import React, { useEffect, useRef } from 'react';
import { Animated, Pressable, Text, View } from 'react-native';
import Reanimated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { haptic } from '../lib/haptics';
import { KalyxRing } from './KalyxRing';
import { fonts, radii, spacing, useTheme } from './theme';
import { radius, springs, durations } from './tokens';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];
/** Taille d'une touche et espacement : le pavé fait 4 rangées = 4×KEY + 3×GAP = 324 px. */
export const PIN_KEY = 70;
export const PIN_GAP = spacing(1.5);
const KEY = PIN_KEY;

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
  hideRing,
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
  /** L'écran affiche l'anneau lui-même (layout fixe : anneau au centre, pavé ancré en bas). */
  hideRing?: boolean;
}) {
  const { colors } = useTheme();
  const shake = useRef(new Animated.Value(0)).current;
  const cap = expectedLength ? Math.min(expectedLength, maxLength) : maxLength;

  useEffect(() => {
    if (!errorSignal) return;
    haptic.error();
    Animated.sequence([
      Animated.timing(shake, { toValue: 10, duration: 45, useNativeDriver: true }),
      Animated.timing(shake, { toValue: -10, duration: 45, useNativeDriver: true }),
      Animated.timing(shake, { toValue: 6, duration: 45, useNativeDriver: true }),
      Animated.timing(shake, { toValue: 0, duration: 45, useNativeDriver: true }),
    ]).start();
  }, [errorSignal, shake]);

  const press = (digit: string) => {
    if (disabled || value.length >= cap) return;
    haptic.selection();
    const next = value + digit;
    onChange(next);
    if (expectedLength && next.length === expectedLength) {
      // Laisse le dernier rond se remplir avant de valider.
      setTimeout(() => onComplete?.(next), 120);
    }
  };
  const back = () => {
    if (disabled || !value.length) return;
    haptic.selection();
    onChange(value.slice(0, -1));
  };

  return (
    <View style={{ alignItems: 'center', gap: spacing(2) }}>
      {/* Anneau de progression (compact : le pavé complet doit tenir sans défiler) */}
      {hideRing ? null : (
        <Animated.View style={{ transform: [{ translateX: shake }], alignItems: 'center', justifyContent: 'center', marginVertical: spacing(0.5) }}>
          <KalyxRing size={104} progress={value.length === 0 ? 0.001 : value.length / (expectedLength || cap)} error={!!errorSignal} />
        </Animated.View>
      )}

      {/* Pavé numérique (3 colonnes ; ⌫ aligné sous le 0) */}
      <View style={{ width: KEY * 3 + PIN_GAP * 2, flexDirection: 'row', flexWrap: 'wrap', gap: PIN_GAP, justifyContent: 'center' }}>
        {KEYS.map((k) => (
          <Key key={k} label={k} onPress={() => press(k)} disabled={disabled} />
        ))}
        <View style={{ width: KEY, height: KEY, alignItems: 'center', justifyContent: 'center' }}>{bottomLeft}</View>
        <Key label="0" onPress={() => press('0')} disabled={disabled} />
        <Pressable
          onPress={back}
          disabled={disabled || !value.length}
          hitSlop={6}
          style={({ pressed }) => ({ width: KEY, height: KEY, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.5 : value.length ? 1 : 0.3 })}
        >
          <Text style={{ color: colors.text, fontSize: 30 }}>⌫</Text>
        </Pressable>
      </View>
    </View>
  );
}

/** Touche du pavé : surface pleine, enfoncement au ressort. */
function Key({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) {
  const { colors } = useTheme();
  const reduced = useReducedMotion();
  const pressed = useSharedValue(0);

  const style = useAnimatedStyle(() => ({
    transform: [{ scale: reduced ? 1 : 1 - pressed.value * 0.06 }],
    backgroundColor: pressed.value > 0.5 ? colors.surface3 : colors.surface2,
  }));

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      onPressIn={() => { pressed.value = reduced ? withTiming(1, { duration: durations.micro }) : withSpring(1, springs.snappy); }}
      onPressOut={() => { pressed.value = reduced ? withTiming(0, { duration: durations.micro }) : withSpring(0, springs.snappy); }}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Reanimated.View
        style={[
          {
            width: KEY,
            height: KEY,
            borderRadius: radius.round,
            alignItems: 'center',
            justifyContent: 'center',
            borderWidth: 1,
            borderColor: colors.border,
          },
          style,
        ]}
      >
        <Text style={{ color: colors.text, fontSize: 27, fontFamily: fonts.semibold }}>{label}</Text>
      </Reanimated.View>
    </Pressable>
  );
}
