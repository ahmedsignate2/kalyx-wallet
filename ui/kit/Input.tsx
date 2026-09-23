/**
 * Input — Orbite, rayon 12, bordure Trait → Lueur au focus. États : normal,
 * focus, erreur, désactivé.
 */
import React, { useState } from 'react';
import { TextInput, View, type TextInputProps } from 'react-native';
import { Text } from './Text';
import { useTheme } from '../theme';
import { radius, space } from '../tokens';

/**
 * Réglages d'un champ qui ne doit JAMAIS être mémorisé par le clavier :
 * phrase de récupération, clé privée, mot de passe de sauvegarde, adresse.
 *
 * C'est de la SÉCURITÉ, pas du confort (docs/08 §7.3). `autoCorrect={false}` ne
 * suffit pas : sur iOS, `spellCheck` est un drapeau DISTINCT, et c'est lui qui
 * alimente le dictionnaire des mots appris — lequel se synchronise dans le
 * cloud du clavier. Douze mots saisis dans un champ mal configuré peuvent en
 * sortir. `textContentType` coupe QuickType et le remplissage automatique iOS,
 * `importantForAutofill` fait de même côté Android.
 *
 * Réunis en une constante précisément pour qu'on ne puisse plus en oublier la
 * moitié, comme c'était le cas partout dans le projet.
 */
export const SENSITIVE_INPUT_PROPS = {
  autoCorrect: false,
  spellCheck: false,
  autoComplete: 'off',
  autoCapitalize: 'none',
  textContentType: 'none',
  importantForAutofill: 'no',
} as const satisfies Partial<TextInputProps>;

export function Input({ label, error, right, style, editable = true, sensitive, ...rest }: TextInputProps & { label?: string; error?: string | null; right?: React.ReactNode; /** Secret ou adresse : coupe apprentissage, suggestions et remplissage auto. */ sensitive?: boolean }) {
  const { colors, typography } = useTheme();
  const [focused, setFocused] = useState(false);
  const border = error ? colors.danger : focused ? colors.textSecondary : colors.border;
  return (
    <View style={{ gap: space[1] }}>
      {label ? <Text variant="caption" tone="secondary">{label}</Text> : null}
      <View style={{ minHeight: 52, borderRadius: radius.input, backgroundColor: colors.surface2, borderWidth: 1, borderColor: border, flexDirection: 'row', alignItems: 'center', paddingHorizontal: space[4], opacity: editable ? 1 : 0.5 }}>
        <TextInput
          {...(sensitive ? SENSITIVE_INPUT_PROPS : null)}
          {...rest}
          editable={editable}
          onFocus={(e) => { setFocused(true); rest.onFocus?.(e); }}
          onBlur={(e) => { setFocused(false); rest.onBlur?.(e); }}
          placeholderTextColor={colors.textTertiary}
          style={[{ flex: 1, paddingVertical: space[3] }, typography.body, style]}
        />
        {right}
      </View>
      {error ? <Text variant="caption" tone="danger">{error}</Text> : null}
    </View>
  );
}
