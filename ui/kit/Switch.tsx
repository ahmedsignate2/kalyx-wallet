/** Interrupteur Kalyx : piste or quand il est allumé, Crépuscule sinon. Le seul de l'app. */
import { Switch as RNSwitch, type SwitchProps } from 'react-native';
import { useTheme } from '../theme';
import { BRAND_GOLD } from '../tokens';
import { withAlpha } from '../../lib/tokenColors';

const THUMB_OFF = '#C9CCD6';

export function Switch({ value, onValueChange, disabled, ...rest }: Omit<SwitchProps, 'trackColor' | 'thumbColor' | 'ios_backgroundColor'> & { value: boolean; onValueChange: (v: boolean) => void }) {
  const { colors } = useTheme();
  return (
    <RNSwitch
      {...rest}
      value={value}
      onValueChange={onValueChange}
      disabled={disabled}
      trackColor={{ false: colors.surface3, true: withAlpha(BRAND_GOLD.light, 0.55) }}
      thumbColor={value ? BRAND_GOLD.light : THUMB_OFF}
      ios_backgroundColor={colors.surface3}
    />
  );
}
