/**
 * Button Kalyx — 4 variantes (§9) : principal (Lumière, h 56, rayon 18),
 * secondaire (Orbite, rayon 12), discret (texte seul), destructif.
 * États : normal, pressé (scale), désactivé, chargement. Zéro dégradé, zéro ombre.
 */
import React from 'react';
import { ActivityIndicator, View, type StyleProp, type ViewStyle } from 'react-native';
import { Pressable } from './Pressable';
import { Text } from './Text';
import { Icon, type IconName } from '../icon';
import { useTheme } from '../theme';
import { radius, BUTTON_HEIGHT, space } from '../tokens';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'destructive';

export function Button({
  label,
  onPress,
  variant = 'primary',
  icon,
  loading,
  disabled,
  size = 'lg',
  dense,
  style,
  accessibilityLabel,
}: {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  icon?: IconName;
  loading?: boolean;
  disabled?: boolean;
  size?: 'lg' | 'md' | 'sm';
  /** Rangée serrée (3 boutons) : libellé 13 pt, padding réduit — jamais de troncature. */
  dense?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}) {
  const { colors } = useTheme();
  const off = disabled || loading;
  const height = size === 'lg' ? BUTTON_HEIGHT : size === 'md' ? 44 : 36;
  const r = size === 'lg' ? radius.button : radius.input;

  const bg =
    variant === 'primary' ? colors.primary
    : variant === 'secondary' ? colors.surface2
    : variant === 'destructive' ? colors.danger
    : 'transparent';
  const fg = variant === 'primary' ? colors.onPrimary : variant === 'destructive' ? '#FFFFFF' : colors.text;

  return (
    <Pressable
      onPress={onPress}
      disabled={off}
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: !!off, busy: !!loading }}
      style={[
        {
          height,
          borderRadius: r,
          backgroundColor: bg,
          paddingHorizontal: size === 'sm' || dense ? space[3] : space[5],
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: space[2],
          opacity: disabled ? 0.4 : 1,
          borderWidth: variant === 'secondary' ? 1 : 0,
          borderColor: colors.border,
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <>
          {icon ? <Icon name={icon} size={size === 'sm' || dense ? 16 : 20} color={fg} /> : null}
          <Text variant={size === 'sm' || dense ? 'caption' : 'body'} style={{ color: fg }} numberOfLines={1}>{label}</Text>
        </>
      )}
      {/* Zone tactile ≥ 48 même en taille sm */}
      {height < 48 ? <View style={{ position: 'absolute', top: -(48 - height) / 2, bottom: -(48 - height) / 2, left: 0, right: 0 }} pointerEvents="none" /> : null}
    </Pressable>
  );
}

/** Bouton icône rond (48 × 48, zone tactile minimale §2.6). */
export function IconButton({ icon, onPress, label, tone = 'surface', disabled }: { icon: IconName; onPress?: () => void; /** Label lecteur d'écran — obligatoire (§8). */ label: string; tone?: 'surface' | 'ghost' | 'primary'; disabled?: boolean }) {
  const { colors } = useTheme();
  const bg = tone === 'primary' ? colors.primary : tone === 'surface' ? colors.surface2 : 'transparent';
  const fg = tone === 'primary' ? colors.onPrimary : colors.text;
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityLabel={label} style={{ width: 48, height: 48, borderRadius: radius.round, backgroundColor: bg, alignItems: 'center', justifyContent: 'center', opacity: disabled ? 0.4 : 1 }}>
      <Icon name={icon} size={22} color={fg} />
    </Pressable>
  );
}
