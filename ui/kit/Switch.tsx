/** Interrupteur Kalyx : piste à l'accent chaud du thème quand il est allumé, surface sinon. Le seul de l'app. */
import { Switch as RNSwitch, type SwitchProps } from 'react-native';
import { useTheme } from '../theme';
import { withAlpha } from '../../lib/tokenColors';

const THUMB_OFF = '#D8CFC2';

export function Switch({ value, onValueChange, disabled, ...rest }: Omit<SwitchProps, 'trackColor' | 'thumbColor' | 'ios_backgroundColor'> & { value: boolean; onValueChange: (v: boolean) => void }) {
  const { colors } = useTheme();
  return (
    <RNSwitch
      {...rest}
      value={value}
      onValueChange={onValueChange}
      disabled={disabled}
      trackColor={{ false: colors.surface3, true: withAlpha(colors.warm, 0.55) }}
      thumbColor={value ? colors.warm : THUMB_OFF}
      ios_backgroundColor={colors.surface3}
    />
  );
}
