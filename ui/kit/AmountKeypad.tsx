/**
 * AmountKeypad — clavier numérique MAISON (§4.3) : jamais le clavier système.
 *
 * Améliorations de l'étape 2 (docs/08 §7.1) :
 *
 *  - SÉPARATEUR DÉCIMAL SELON LA LANGUE. La touche affichait « , » en dur, y
 *    compris en anglais, en japonais ou en chinois, où c'est le point. Il est
 *    maintenant déduit de la langue active. La VALEUR, elle, reste en notation
 *    point : c'est un nombre destiné à la chaîne, pas du texte à lire.
 *  - LA TOUCHE S'ALLUME AU RESSORT au lieu de changer de fond d'un coup, et
 *    seule la touche touchée bouge — pas la grille (§7.1).
 *  - MAINTENIR « effacer » EFFACE EN CONTINU. Corriger un montant de huit
 *    chiffres demandait huit appuis.
 *
 * L'haptique reste « sélection » : sur un pavé, on CHOISIT un chiffre (§5).
 * Le parent gère la chaîne (on n'impose ni longueur ni format ici).
 */
import React, { useCallback, useEffect, useRef } from 'react';
import { View, Pressable as RNPressable } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { Text } from './Text';
import { Icon } from '../icon';
import { useTheme } from '../theme';
import { radius, space, springs, durations } from '../tokens';
import { haptic } from '../../lib/haptics';
import { useSettings, useT } from '../../lib/settingsStore';

const ROWS = [['1', '2', '3'], ['4', '5', '6'], ['7', '8', '9'], ['.', '0', '⌫']];

/** Délai avant que le maintien ne déclenche l'effacement continu. */
const HOLD_DELAY = 420;
/** Rythme de l'effacement continu. */
const HOLD_REPEAT = 90;

/**
 * Séparateur décimal de la langue active. On demande à Intl plutôt que de
 * maintenir une liste de langues à la main : c'est exactement son travail, et
 * une liste finit toujours par oublier une langue.
 */
function decimalSeparator(lang: string): string {
  try {
    const parts = new Intl.NumberFormat(lang).formatToParts(1.1);
    return parts.find((p) => p.type === 'decimal')?.value ?? '.';
  } catch {
    return '.';
  }
}

/** Une touche : fond qui s'allume au ressort, sans entraîner la grille. */
function KeyBase({
  label, onPress, onPressIn, onPressOut, disabled, children,
}: {
  label: string;
  onPress: () => void;
  onPressIn?: () => void;
  onPressOut?: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  const { colors } = useTheme();
  const reduced = useReducedMotion();
  const lit = useSharedValue(0);

  const style = useAnimatedStyle(() => ({
    backgroundColor: lit.value > 0.5 ? colors.surface3 : 'transparent',
    transform: [{ scale: reduced ? 1 : 1 - lit.value * 0.04 }],
  }));

  const down = () => {
    lit.value = reduced ? withTiming(1, { duration: durations.micro }) : withSpring(1, springs.snappy);
    onPressIn?.();
  };
  const up = () => {
    lit.value = reduced ? withTiming(0, { duration: durations.micro }) : withSpring(0, springs.snappy);
    onPressOut?.();
  };

  return (
    <RNPressable
      onPress={onPress}
      onPressIn={down}
      onPressOut={up}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={{ flex: 1 }}
    >
      <Animated.View
        style={[{ height: 56, borderRadius: radius.input, alignItems: 'center', justifyContent: 'center' }, style]}
      >
        {children}
      </Animated.View>
    </RNPressable>
  );
}

export function AmountKeypad({
  value, onChange, maxDecimals = 8, disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  maxDecimals?: number;
  disabled?: boolean;
}) {
  const t = useT();
  const language = useSettings((s) => s.language);
  const sep = decimalSeparator(language);
  /** Deux minuteurs distincts : le délai avant maintien, puis la répétition. */
  const delayTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const repeatTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  /** Dernière valeur connue : le minuteur ne doit pas fermer une valeur périmée. */
  const latest = useRef(value);
  latest.current = value;

  const press = useCallback((k: string) => {
    if (disabled) return;
    haptic.selection();
    const v = latest.current;
    if (k === '⌫') return onChange(v.slice(0, -1));
    if (k === '.') {
      if (v.includes('.')) return;
      return onChange(v === '' ? '0.' : v + '.');
    }
    const [, frac = ''] = v.split('.');
    if (v.includes('.') && frac.length >= maxDecimals) return;
    if (v === '0') return onChange(k);
    onChange(v + k);
  }, [disabled, maxDecimals, onChange]);

  const stopHold = useCallback(() => {
    if (delayTimer.current) { clearTimeout(delayTimer.current); delayTimer.current = null; }
    if (repeatTimer.current) { clearInterval(repeatTimer.current); repeatTimer.current = null; }
  }, []);

  /** Maintien sur « effacer » : on efface en continu jusqu'au relâchement. */
  const startHold = useCallback(() => {
    if (disabled) return;
    stopHold();
    delayTimer.current = setTimeout(() => {
      repeatTimer.current = setInterval(() => {
        if (!latest.current.length) return stopHold();
        haptic.selection();
        onChange(latest.current.slice(0, -1));
      }, HOLD_REPEAT);
    }, HOLD_DELAY);
  }, [disabled, onChange, stopHold]);

  useEffect(() => stopHold, [stopHold]);

  return (
    <View style={{ gap: space[2] }}>
      {ROWS.map((row) => (
        <View key={row.join('')} style={{ flexDirection: 'row', gap: space[2] }}>
          {row.map((k) => (
            <KeyBase
              key={k}
              label={k === '⌫' ? t('keypadErase') : k === '.' ? t('keypadComma') : k}
              onPress={() => press(k)}
              onPressIn={k === '⌫' ? startHold : undefined}
              onPressOut={k === '⌫' ? stopHold : undefined}
              disabled={disabled}
            >
              {k === '⌫' ? <Icon name="back" size={22} /> : <Text variant="title1" tabular>{k === '.' ? sep : k}</Text>}
            </KeyBase>
          ))}
        </View>
      ))}
    </View>
  );
}
