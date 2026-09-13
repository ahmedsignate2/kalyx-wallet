import React from 'react';
import { View, StyleSheet, ActivityIndicator } from 'react-native';
import { Text } from '../../../ui/kit';
import { Icon } from '../../../ui/icon';
import { useTheme } from '../../../ui/theme';
import { useT } from '../../../lib/settingsStore';
import { space, radius } from '../../../ui/tokens';
import type { Key } from '../../../lib/i18n';
import type { SimulationResult } from '../../services/security/simulationService';

interface Props {
  simulation: SimulationResult | null;
  loading?: boolean;
}

export const AntiDrainerBanner: React.FC<Props> = ({ simulation, loading }) => {
  const { colors } = useTheme();
  const t = useT();

  const renderWarningText = (msg: string): string => {
    if (
      msg === 'security.simulation.maliciousAddress' ||
      msg === 'maliciousAddress' ||
      msg === 'antiDrainerMaliciousAddress'
    ) {
      return t('security.simulation.maliciousAddress');
    }
    if (msg === 'antiDrainerUnlimitedApproval') {
      return t('antiDrainerUnlimitedApproval');
    }
    if (msg === 'antiDrainerNftApproval') {
      return t('antiDrainerNftApproval');
    }
    if (msg === 'antiDrainerNonInteractiveContract') {
      return t('antiDrainerNonInteractiveContract');
    }
    return t(msg as any) || msg;
  };

  if (loading) {
    return (
      <View
        style={[
          styles.container,
          {
            backgroundColor: colors.surface2,
            borderColor: colors.border,
            flexDirection: 'row',
            alignItems: 'center',
            gap: space[2],
          },
        ]}
      >
        <ActivityIndicator size="small" color={colors.primary} />
        <Text variant="caption" tone="secondary">
          {t('antiDrainerLoading')}
        </Text>
      </View>
    );
  }

  if (!simulation) return null;

  if (simulation.warningLevel === 'critical') {
    return (
      <View
        style={[
          styles.container,
          {
            backgroundColor: 'rgba(255, 59, 48, 0.12)',
            borderColor: colors.danger,
          },
        ]}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2], marginBottom: space[1] }}>
          <Icon name="alert" size={18} color={colors.danger} />
          <Text variant="body" tone="danger" style={{ fontWeight: '700' }}>
            {t('antiDrainerCriticalTitle')}
          </Text>
        </View>
        {simulation.warnings.map((msg, index) => (
          <Text key={index} variant="caption" tone="danger" style={{ lineHeight: 18 }}>
            • {renderWarningText(msg)}
          </Text>
        ))}
      </View>
    );
  }

  if (simulation.warningLevel === 'warning') {
    return (
      <View
        style={[
          styles.container,
          {
            backgroundColor: 'rgba(255, 149, 0, 0.12)',
            borderColor: colors.warning,
          },
        ]}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2], marginBottom: space[1] }}>
          <Icon name="alert" size={18} color={colors.warning} />
          <Text variant="body" tone="warning" style={{ fontWeight: '700' }}>
            {t('antiDrainerWarningTitle')}
          </Text>
        </View>
        {simulation.warnings.map((msg, index) => (
          <Text key={index} variant="caption" tone="warning" style={{ lineHeight: 18 }}>
            • {renderWarningText(msg)}
          </Text>
        ))}
      </View>
    );
  }

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: 'rgba(52, 199, 89, 0.1)',
          borderColor: '#34C759',
          flexDirection: 'row',
          alignItems: 'center',
          gap: space[2],
        },
      ]}
    >
      <Icon name="check" size={16} color="#34C759" />
      <Text variant="caption" style={{ color: '#34C759', fontWeight: '500', flex: 1 }}>
        {t('antiDrainerSafe')}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: space[3],
    borderRadius: radius.container,
    marginVertical: space[2],
    borderWidth: 1,
  },
});
