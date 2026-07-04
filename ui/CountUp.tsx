/**
 * Nombre animé « count-up » : quand `value` change, le texte compte de
 * l'ancienne valeur vers la nouvelle (~600 ms, easing natif d'Animated).
 * Utilisé pour le solde total (signature fintech premium).
 */
import React, { useEffect, useRef, useState } from 'react';
import { Animated, Text, type StyleProp, type TextStyle } from 'react-native';

export function CountUp({
  value,
  format,
  style,
  duration = 600,
}: {
  value: number;
  /** Formate la valeur courante (ex. v → « 1 234,56 € »). */
  format: (v: number) => string;
  style?: StyleProp<TextStyle>;
  duration?: number;
}) {
  // Dernière valeur AFFICHÉE (point de départ si `value` change en pleine anim).
  const shown = useRef(0);
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    const from = shown.current;
    if (from === value) {
      setDisplay(value);
      return;
    }
    const anim = new Animated.Value(0);
    const id = anim.addListener(({ value: p }) => {
      const v = from + (value - from) * p;
      shown.current = v;
      setDisplay(v);
    });
    // JS driver : on pilote un state React, pas une propriété native.
    Animated.timing(anim, { toValue: 1, duration, useNativeDriver: false }).start();
    return () => anim.removeListener(id);
  }, [value, duration]);

  return (
    <Text style={style} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.5}>
      {format(display)}
    </Text>
  );
}
