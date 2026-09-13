/** EmptyState — un écran vide invite à une action (§6). Icône, phrase, bouton. */
import React from 'react';
import { View } from 'react-native';
import { Text } from './Text';
import { Button } from './Button';
import { Icon, type IconName } from '../icon';
import { useTheme } from '../theme';
import { space, radius } from '../tokens';

export function EmptyState({ icon, title, body, actionLabel, onAction }: { icon: IconName; title: string; body?: string; actionLabel?: string; onAction?: () => void }) {
  const { colors } = useTheme();
  return (
    <View style={{ alignItems: 'center', paddingVertical: space[8], paddingHorizontal: space[6], gap: space[3] }}>
      <View style={{ width: 56, height: 56, borderRadius: radius.round, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name={icon} size={26} tone="muted" />
      </View>
      <Text variant="title2" style={{ textAlign: 'center' }}>{title}</Text>
      {body ? <Text variant="bodySecondary" tone="secondary" style={{ textAlign: 'center' }}>{body}</Text> : null}
      {actionLabel && onAction ? <Button label={actionLabel} onPress={onAction} variant="secondary" size="md" style={{ marginTop: space[2] }} /> : null}
    </View>
  );
}
