/**
 * Chip / Badge — rayon 8, texte « micro » ou « caption ». Badge de risque (§4.7) :
 * neutre (« Aucun risque détecté », jamais en vert), attention (orange), danger (rouge).
 */
import React from 'react';
import { View } from 'react-native';
import { Pressable } from './Pressable';
import { Text } from './Text';
import { Icon, type IconName } from '../icon';
import { useTheme } from '../theme';
import { radius, space } from '../tokens';

export function Chip({ label, selected, onPress, icon }: { label: string; selected?: boolean; onPress?: () => void; icon?: IconName }) {
  const { colors } = useTheme();
  const inner = (
    <View style={{ height: 32, paddingHorizontal: space[3], borderRadius: radius.chip, backgroundColor: selected ? colors.primary : colors.surface2, borderWidth: 1, borderColor: selected ? colors.primary : colors.border, flexDirection: 'row', alignItems: 'center', gap: space[1] }}>
      {icon ? <Icon name={icon} size={14} color={selected ? colors.onPrimary : colors.text} /> : null}
      <Text variant="caption" style={{ color: selected ? colors.onPrimary : colors.text }}>{label}</Text>
    </View>
  );
  return onPress ? <Pressable onPress={onPress} accessibilityState={{ selected: !!selected }}>{inner}</Pressable> : inner;
}

export type RiskLevel = 'none' | 'warning' | 'danger';

export function RiskBadge({ level, label }: { level: RiskLevel; label?: string }) {
  const { colors } = useTheme();
  const color = level === 'danger' ? colors.danger : level === 'warning' ? colors.warning : colors.textSecondary;
  const text = label ?? (level === 'danger' ? 'Danger' : level === 'warning' ? 'Attention' : 'Aucun risque détecté');
  const icon: IconName = level === 'danger' ? 'errorCircle' : level === 'warning' ? 'alert' : 'checkmark';
  return (
    <View style={{ alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: space[1], paddingHorizontal: space[2], height: 24, borderRadius: radius.chip, backgroundColor: colors.surface2, borderWidth: 1, borderColor: level === 'none' ? colors.border : color }}>
      <Icon name={icon} size={13} color={color} />
      <Text variant="micro" style={{ color }}>{text}</Text>
    </View>
  );
}
