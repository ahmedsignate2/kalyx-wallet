/**
 * Entrée en fondu + légère montée, avec délai — pour un effet de CASCADE quand on
 * l'applique à une liste (`delay = cascadeDelay(index)`). N'anime qu'au montage,
 * sur le pilote natif : aucun coût JS pendant l'animation.
 *
 * DEUX CORRECTIONS. Ce composant inventait ses propres durées et son propre
 * easing, alors que `ui/motion` existe précisément pour qu'aucun écran ne le
 * fasse — la cohérence du mouvement ne tient que si tout part des mêmes valeurs.
 * Et il ignorait le réglage système « réduire les animations » : une cascade de
 * douze lignes reste désagréable pour qui a demandé au système de calmer le
 * mouvement, et ce réglage n'existe pas pour être contourné.
 */
import React, { useEffect, useRef } from 'react';
import { Animated, type StyleProp, type ViewStyle } from 'react-native';
import { duration, easing } from './motion';
import { useReduceMotion } from '../lib/reduceMotion';

export function FadeInUp({
  children,
  delay = 0,
  distance = 12,
  style,
}: {
  children: React.ReactNode;
  delay?: number;
  distance?: number;
  /**
   * Style de l'enrobage, indispensable dès qu'on entoure un contenu qui compte
   * sur la mise en page de son parent.
   *
   * Sans `flex: 1`, une vue intercalée devant un espaceur `flex: 1` l'écrase :
   * le bouton que l'espaceur poussait en bas d'écran remonte coller au contenu.
   * L'animation ne doit rien changer à la disposition.
   */
  style?: StyleProp<ViewStyle>;
}) {
  const reduceMotion = useReduceMotion();
  const op = useRef(new Animated.Value(0)).current;
  const y = useRef(new Animated.Value(distance)).current;

  useEffect(() => {
    if (reduceMotion) {
      /*
       * On saute à l'état final au lieu de ne rien faire : le contenu doit être
       * visible même si le réglage change après le montage, sinon il resterait
       * transparent pour toujours.
       */
      op.setValue(1);
      y.setValue(0);
      return;
    }
    Animated.parallel([
      Animated.timing(op, { toValue: 1, duration: duration.base, delay, useNativeDriver: true }),
      Animated.timing(y, { toValue: 0, duration: duration.base, delay, easing: easing.out, useNativeDriver: true }),
    ]).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduceMotion]);

  return (
    <Animated.View style={[style, { opacity: op, transform: [{ translateY: y }] }]}>{children}</Animated.View>
  );
}
