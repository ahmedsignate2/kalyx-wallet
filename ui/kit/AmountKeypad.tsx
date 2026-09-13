import { useT } from "../../lib/settingsStore";
/**
 * AmountKeypad — clavier numérique MAISON (§4.3) : pas le clavier système.
 * Touches 0–9, séparateur décimal, effacer ; haptique « selection » par touche.
 * Le parent gère la chaîne (on n'impose ni longueur ni format ici).
 */
import React from 'react';
import { View, Pressable as RNPressable } from 'react-native';
import { Text } from './Text';
import { Icon } from '../icon';
import { useTheme } from '../theme';
import { radius, space } from '../tokens';
import { haptic } from '../../lib/haptics';

const ROWS = [['1', '2', '3'], ['4', '5', '6'], ['7', '8', '9'], ['.', '0', '⌫']];

export function AmountKeypad({ value, onChange, maxDecimals = 8, disabled }: { value: string; onChange: (v: string) => void; maxDecimals?: number; disabled?: boolean }) {
  const t = useT();
  const { colors } = useTheme();
  const press = (k: string) => {
    if (disabled) return;
    haptic.selection();
    if (k === '⌫') return onChange(value.slice(0, -1));
    if (k === '.') {
      if (value.includes('.')) return;
      return onChange(value === '' ? '0.' : value + '.');
    }
    const [, frac = ''] = value.split('.');
    if (value.includes('.') && frac.length >= maxDecimals) return;
    if (value === '0') return onChange(k);
    onChange(value + k);
  };
  return (
    <View style={{ gap: space[2] }} accessibilityRole="keyboardkey">
      {ROWS.map((row) => (
        <View key={row.join('')} style={{ flexDirection: 'row', gap: space[2] }}>
          {row.map((k) => (
            <RNPressable
              key={k}
              onPress={() => press(k)}
              disabled={disabled}
              accessibilityRole="button"
              accessibilityLabel={k === '⌫' ? t("keypadErase") : k === '.' ? t("keypadComma") : k}
              style={({ pressed }) => ({ flex: 1, height: 56, borderRadius: radius.input, alignItems: 'center', justifyContent: 'center', backgroundColor: pressed ? colors.surface3 : 'transparent' })}
            >
              {k === '⌫' ? <Icon name="back" size={22} /> : <Text variant="title1" tabular>{k === '.' ? ',' : k}</Text>}
            </RNPressable>
          ))}
        </View>
      ))}
    </View>
  );
}
