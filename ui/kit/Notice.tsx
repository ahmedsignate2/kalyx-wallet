/** Encadré d'erreur ou d'avertissement : icône + message, teinté par le ton. */
import { View } from 'react-native';
import { Text } from './Text';
import { Icon } from '../icon';
import { useTheme } from '../theme';
import { radii, spaces } from '../tokens';
import { withAlpha } from '../../lib/tokenColors';

export function Notice({ message, tone = 'danger' }: { message: string; tone?: 'danger' | 'warning' }) {
  const { colors } = useTheme();
  const c = tone === 'warning' ? colors.warning : colors.danger;
  return (
    <View
      style={{ flexDirection: 'row', alignItems: 'center', gap: spaces.sm, backgroundColor: withAlpha(c, 0.09), borderWidth: 1, borderColor: withAlpha(c, 0.33), borderRadius: radii.md, padding: spaces.md }}
    >
      <Icon name="warning" size={18} color={c} />
      <Text variant="label" style={{ color: colors.text, flex: 1 }}>{message}</Text>
    </View>
  );
}
