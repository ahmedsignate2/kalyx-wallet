/**
 * HoldButton — « maintenir pour envoyer » (§3.4, moment signature n° 3).
 * Pendant l'appui (1,2 s), la lumière remplit le bouton de gauche à droite ;
 * le libellé passe en couleur inversée au fur et à mesure (deux couches, la
 * seconde découpée par le remplissage). À 100 % : haptique forte + onComplete
 * (le parent lance la biométrie puis l'éclat). Relâcher avant : la lumière se
 * retire avec le ressort Standard. Version Reanimated ; particules Skia plus tard.
 */
import React, { useRef, useState } from 'react';
import { Pressable as RNPressable, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming, withSpring, runOnJS, Easing, cancelAnimation } from 'react-native-reanimated';
import { Text } from './Text';
import { Icon, type IconName } from '../icon';
import { useTheme } from '../theme';
import { radius, BUTTON_HEIGHT, durations, springs, space } from '../tokens';
import { haptic } from '../../lib/haptics';

export function HoldButton({
  label,
  onComplete,
  icon = 'send',
  disabled,
  durationMs = durations.holdToSend,
  danger,
}: {
  label: string;
  onComplete: () => void;
  icon?: IconName;
  disabled?: boolean;
  durationMs?: number;
  /** Niveau Danger (§4.7) : remplissage rouge, maintien plus long (2 s). */
  danger?: boolean;
}) {
  const { colors } = useTheme();
  const progress = useSharedValue(0);
  const holding = useRef(false);
  const [width, setWidth] = useState(0);

  const fire = () => {
    haptic.heavy();
    onComplete();
  };
  const start = () => {
    if (disabled) return;
    holding.current = true;
    haptic.light();
    progress.value = withTiming(1, { duration: danger ? Math.max(durationMs, 2000) : durationMs, easing: Easing.linear }, (finished) => {
      if (finished) runOnJS(fire)();
    });
  };
  const cancel = () => {
    if (!holding.current) return;
    holding.current = false;
    cancelAnimation(progress);
    if (progress.value < 1) progress.value = withSpring(0, springs.standard);
  };

  const fill = useAnimatedStyle(() => ({ width: progress.value * width }));
  const fillBg = danger ? colors.danger : colors.primary;
  const fillFg = danger ? '#FFFFFF' : colors.onPrimary;

  const Layer = ({ color }: { color: string }) => (
    <View style={{ width: width || '100%', height: BUTTON_HEIGHT, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space[2] }}>
      <Icon name={icon} size={20} color={color} />
      <Text variant="body" style={{ color }}>{label}</Text>
    </View>
  );

  return (
    <RNPressable
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      onPressIn={start}
      onPressOut={cancel}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint="Maintiens le bouton pour confirmer"
      style={{ height: BUTTON_HEIGHT, borderRadius: radius.button, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border, overflow: 'hidden', opacity: disabled ? 0.4 : 1 }}
    >
      <Layer color={colors.text} />
      {/* Lumière + libellé inversé, découpés par la progression */}
      <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: 0, top: 0, bottom: 0, overflow: 'hidden', backgroundColor: fillBg }, fill]}>
        <Layer color={fillFg} />
      </Animated.View>
    </RNPressable>
  );
}
