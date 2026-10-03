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
import { decimalSeparator } from '../../src';
import { View, Platform, Pressable as RNPressable } from 'react-native';
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

/** Une touche : fond qui s'allume au ressort, sans entraîner la grille. */
function KeyBase({
  label, onPress, onPressIn, onPressOut, disabled, children, height = 56,
}: {
  height?: number;
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
        style={[{ height, borderRadius: radius.input, alignItems: 'center', justifyContent: 'center' }, style]}
      >
        {children}
      </Animated.View>
    </RNPressable>
  );
}

export function AmountKeypad({
  value, onChange, maxDecimals = 8, disabled, compact,
}: {
  value: string;
  onChange: (v: string) => void;
  maxDecimals?: number;
  disabled?: boolean;
  /** Touches basses (ordinateur : on tape surtout au clavier). */
  compact?: boolean;
}) {
  const t = useT();
  // MÊME séparateur que tous les montants affichés (src : fixé selon la langue) — l'ancien, via Intl,
  // donnait « ٫ » en arabe quand le reste de l'écran écrivait « . ».
  useSettings((s) => s.language); // re-rendu au changement de langue
  const sep = decimalSeparator();
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
      if (v.includes('.') || maxDecimals <= 0) return; // jeton sans décimale : pas de virgule
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

  /*
   * CLAVIER PHYSIQUE (web) : sur ordinateur, cliquer chiffre par chiffre était
   * la seule façon de saisir un montant. Chiffres, virgule ou point, Retour
   * arrière — sauf quand un vrai champ de saisie a le focus.
   */
  useEffect(() => {
    if (Platform.OS !== 'web' || disabled) return;
    const w = (globalThis as { window?: { addEventListener: (t: string, f: (e: KeyboardEvent) => void) => void; removeEventListener: (t: string, f: (e: KeyboardEvent) => void) => void } }).window;
    if (!w) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const el = e.target as { tagName?: string; isContentEditable?: boolean } | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return;
      if (/^[0-9]$/.test(e.key)) press(e.key);
      else if (e.key === '.' || e.key === ',') press('.');
      else if (e.key === 'Backspace' || e.key === 'Delete') press('⌫');
      else return;
      e.preventDefault();
    };
    w.addEventListener('keydown', onKey);
    return () => w.removeEventListener('keydown', onKey);
  }, [disabled, press]);

  return (
    <View style={{ gap: compact ? space[1] : space[2] }}>
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
              height={compact ? 44 : 56}
            >
              {k === '⌫' ? <Icon name="back" size={22} /> : <Text variant="title1" tabular>{k === '.' ? sep : k}</Text>}
            </KeyBase>
          ))}
        </View>
      ))}
    </View>
  );
}
