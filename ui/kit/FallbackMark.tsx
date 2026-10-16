/**
 * MARQUE DE REPLI, sans lettre : ce qui s'affiche quand un vrai logo manque.
 *
 * Une initiale (« U », « S ») faisait brouillon et pouvait se confondre avec un
 * vrai logo. À la place :
 *  - `token` : une pièce à SA couleur et son étoile, tirées du contrat — deux
 *    jetons différents ne se ressemblent jamais, le même est toujours identique ;
 *  - `site`  : un disque neutre et l'icône des dApps — un site inconnu ne se
 *    déguise pas en marque.
 */
import { View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { glyphFor, starPath } from '../../src';
import { Icon } from '../icon';
import { useTheme } from '../theme';

export function FallbackMark({ seed, size, kind = 'token', radius = size / 2 }: { seed: string; size: number; kind?: 'token' | 'site'; radius?: number }) {
  const { colors } = useTheme();
  if (kind === 'site') {
    return (
      <View style={{ width: size, height: size, borderRadius: radius, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name="dapps" size={Math.round(size * 0.5)} color={colors.textSecondary} />
      </View>
    );
  }
  const g = glyphFor(seed || '?');
  const c = size / 2;
  return (
    <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} accessibilityElementsHidden importantForAccessibility="no">
      <Circle cx={c} cy={c} r={c} fill={g.colors[0]} />
      <Circle cx={c} cy={c} r={c * 0.78} fill="none" stroke={g.colors[1]} strokeOpacity={0.55} strokeWidth={Math.max(1, size * 0.05)} />
      <Path d={starPath(g, c, c, c * 0.5)} fill="#FFFFFF" fillOpacity={0.92} />
    </Svg>
  );
}
