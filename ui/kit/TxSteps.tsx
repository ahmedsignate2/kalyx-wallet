/** TxSteps — suivi (§4.3) : Envoyée → Incluse dans un bloc → Confirmée. */
import React from 'react';
import { View } from 'react-native';
import { Text } from './Text';
import { Icon } from '../icon';
import { useTheme } from '../theme';
import { space, radius } from '../tokens';

export type TxStage = 'sent' | 'included' | 'confirmed' | 'failed';
const STEPS: { key: TxStage; label: string }[] = [
  { key: 'sent', label: 'Envoyée' },
  { key: 'included', label: 'Incluse dans un bloc' },
  { key: 'confirmed', label: 'Confirmée' },
];

export function TxSteps({ stage }: { stage: TxStage }) {
  const { colors } = useTheme();
  const reached = stage === 'failed' ? 1 : STEPS.findIndex((s) => s.key === stage) + 1;
  return (
    <View style={{ gap: space[3] }}>
      {STEPS.map((s, i) => {
        const done = i < reached;
        const current = i === reached - 1 && stage !== 'confirmed';
        const failedHere = stage === 'failed' && i === 1;
        const color = failedHere ? colors.danger : done ? colors.text : colors.textTertiary;
        return (
          <View key={s.key} style={{ flexDirection: 'row', alignItems: 'center', gap: space[3] }}>
            <View style={{ width: 24, height: 24, borderRadius: radius.round, backgroundColor: done && !failedHere ? colors.primary : colors.surface3, alignItems: 'center', justifyContent: 'center' }}>
              {failedHere ? <Icon name="close" size={14} color={colors.danger} /> : done ? <Icon name="checkmark" size={14} color={colors.onPrimary} /> : null}
            </View>
            <Text variant="body" style={{ color }}>{failedHere ? 'Échouée' : s.label}{current && !failedHere ? '…' : ''}</Text>
          </View>
        );
      })}
    </View>
  );
}
