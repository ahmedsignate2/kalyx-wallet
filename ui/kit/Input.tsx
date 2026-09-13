/** Input — Orbite, rayon 12, bordure Trait → Lueur au focus. États : normal, focus, erreur, désactivé. */
import React, { useState } from 'react';
import { TextInput, View, type TextInputProps } from 'react-native';
import { Text } from './Text';
import { useTheme } from '../theme';
import { radius, space } from '../tokens';

export function Input({ label, error, right, style, editable = true, ...rest }: TextInputProps & { label?: string; error?: string | null; right?: React.ReactNode }) {
  const { colors, typography } = useTheme();
  const [focused, setFocused] = useState(false);
  const border = error ? colors.danger : focused ? colors.textSecondary : colors.border;
  return (
    <View style={{ gap: space[1] }}>
      {label ? <Text variant="caption" tone="secondary">{label}</Text> : null}
      <View style={{ minHeight: 52, borderRadius: radius.input, backgroundColor: colors.surface2, borderWidth: 1, borderColor: border, flexDirection: 'row', alignItems: 'center', paddingHorizontal: space[4], opacity: editable ? 1 : 0.5 }}>
        <TextInput
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
