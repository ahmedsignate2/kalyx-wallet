/**
 * La comète de chargement (§ détail signature n° 1) : un trait fin de Lumière
 * avec une toute petite lueur au bout — le halo en version minuscule.
 *
 * Abonnée directement à la progression : chaque octet reçu anime le trait sur
 * le thread UI sans re-rendre l'écran (ni la WebView) qui la porte. Le trait
 * s'étire par `scaleX` et la lueur glisse par `translateX` — aucune mise en
 * page recalculée pendant le chargement.
 */
import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { useTheme } from '../theme';
import { springs } from '../tokens';
import type { Ticker } from '../../lib/ticker';

export function Comet({ progress, active = true }: { /** 0..1 ; 0 ou 1 = masquée. */ progress: Ticker; /** Faux : comète masquée (page nouvel onglet). */ active?: boolean }) {
  const { colors, halo } = useTheme();
  const p = useSharedValue(0);
  const op = useSharedValue(0);
  const width = useSharedValue(0);
  useEffect(() => {
    const apply = () => {
      const value = active ? progress.get() : 0;
      const visible = value > 0 && value < 1;
      op.value = withTiming(visible ? 1 : 0, { duration: visible ? 80 : 300 });
      p.value = visible ? withSpring(value, springs.gentle) : withTiming(value >= 1 ? 1 : 0, { duration: 200 });
    };
    apply();
    return progress.subscribe(apply);
  }, [progress, active, p, op]);
  const line = useAnimatedStyle(() => ({ transform: [{ scaleX: p.value }], opacity: op.value }));
  const tip = useAnimatedStyle(() => ({ transform: [{ translateX: p.value * width.value }], opacity: op.value }));
  return (
    <View pointerEvents="none" style={{ height: 2, width: '100%' }} onLayout={(e) => { width.value = e.nativeEvent.layout.width; }}>
      <Animated.View style={[{ position: 'absolute', left: 0, top: 0, height: 2, width: '100%', transformOrigin: 'left', backgroundColor: colors.primary }, line]} />
      <Animated.View style={[{ position: 'absolute', left: 0, top: -3, marginLeft: -6, width: 12, height: 8, borderRadius: 6, backgroundColor: halo.stops[1], shadowColor: '#FFFFFF', shadowOpacity: 0.9, shadowRadius: 6, elevation: 6 }, tip]} />
    </View>
  );
}
