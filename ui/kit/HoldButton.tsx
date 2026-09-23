/**
 * HoldButton — « maintenir pour envoyer » (§3.4, moment signature n° 3).
 *
 * Pendant l'appui, la lumière remplit le bouton de gauche à droite ; le libellé
 * passe en couleur inversée au fur et à mesure (deux couches, la seconde
 * découpée par le remplissage).
 *
 * MONTÉE EN TENSION (docs/08 §6.3). Le remplissage seul ne dit pas l'effort :
 * on ajoute une RÉSISTANCE qui se sent. Le bouton se comprime progressivement
 * (jusqu'à 0,97) et les ticks haptiques se RAPPROCHENT à mesure qu'on approche
 * du bout — du calme au serré. À l'accomplissement la compression se relâche
 * d'un coup et l'haptique passe en `heavy` : c'est le « clac ». Relâcher trop
 * tôt n'est PAS une erreur : la lumière redescend depuis sa position réelle,
 * sans vibration de reproche.
 *
 * ACCESSIBILITÉ (§6.3). Un maintien chronométré est difficile avec VoiceOver ou
 * TalkBack, qui capturent l'appui long. Une action d'accessibilité dédiée
 * (« Confirmer ») déclenche donc directement `onComplete` : le geste reste le
 * même pour tout le monde, la voie d'accès change.
 */
import React, { useEffect, useRef, useState } from 'react';
import { Pressable as RNPressable, View } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withTiming, withSpring, runOnJS, Easing, cancelAnimation } from 'react-native-reanimated';
import { Text } from './Text';
import { Icon, type IconName } from '../icon';
import { useTheme } from '../theme';
import { radius, BUTTON_HEIGHT, durations, springs, space } from '../tokens';
import { useT } from '../../lib/settingsStore';
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
  const t = useT();
  const progress = useSharedValue(0);
  const holding = useRef(false);
  const [width, setWidth] = useState(0);
  const reduced = useReducedMotion();
  /** Minuteur des ticks : leur écart se resserre avec la progression. */
  const tick = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startedAt = useRef(0);

  const total = danger ? Math.max(durationMs, 2000) : durationMs;

  const stopTicks = () => {
    if (tick.current) { clearTimeout(tick.current); tick.current = null; }
  };

  /**
   * Ticks qui se rapprochent : l'écart va de ~180 ms au début à ~55 ms à la fin.
   * C'est ce resserrement, et non le remplissage, qui fait sentir la résistance.
   */
  const scheduleTick = () => {
    const elapsed = Date.now() - startedAt.current;
    const p = Math.min(1, elapsed / total);
    const gap = 180 - p * 125;
    tick.current = setTimeout(() => {
      if (!holding.current) return;
      haptic.selection();
      scheduleTick();
    }, gap);
  };

  const fire = () => {
    holding.current = false;
    stopTicks();
    haptic.heavy(); // le « clac » : la validation lourde du §5
    onComplete();
  };
  const start = () => {
    if (disabled) return;
    holding.current = true;
    startedAt.current = Date.now();
    haptic.light();
    if (!reduced) scheduleTick();
    progress.value = withTiming(1, { duration: total, easing: Easing.linear }, (finished) => {
      if (finished) runOnJS(fire)();
    });
  };
  const cancel = () => {
    if (!holding.current) return;
    holding.current = false;
    stopTicks();
    cancelAnimation(progress);
    // Redescente depuis la position RÉELLE (§4.2) et aucune haptique : lâcher
    // trop tôt est un changement d'avis, pas une faute.
    if (progress.value < 1) progress.value = withSpring(0, springs.standard);
  };

  useEffect(() => stopTicks, []);

  const fill = useAnimatedStyle(() => ({ width: progress.value * width }));
  /** Compression : le bouton résiste de plus en plus, puis se relâche. */
  const squeeze = useAnimatedStyle(() =>
    reduced ? {} : { transform: [{ scale: 1 - progress.value * 0.03 }] },
  );
  const fillBg = danger ? colors.danger : colors.primary;
  const fillFg = danger ? '#FFFFFF' : colors.onPrimary;

  const Layer = ({ color }: { color: string }) => (
    <View style={{ width: width || '100%', height: BUTTON_HEIGHT, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space[2] }}>
      <Icon name={icon} size={20} color={color} />
      <Text variant="body" style={{ color }}>{label}</Text>
    </View>
  );

  return (
    <Animated.View style={squeeze}>
      <RNPressable
        onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
        onPressIn={start}
        onPressOut={cancel}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityHint={t('holdToConfirm')}
        /*
         * Voie d'accès pour les lecteurs d'écran : VoiceOver et TalkBack
         * capturent l'appui long, un maintien chronométré leur est donc
         * inaccessible. L'action « Confirmer » mène au même endroit.
         */
        accessibilityActions={[{ name: 'activate', label: t('pinValidate') }]}
        onAccessibilityAction={(e) => { if (e.nativeEvent.actionName === 'activate' && !disabled) fire(); }}
        style={{ height: BUTTON_HEIGHT, borderRadius: radius.button, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border, overflow: 'hidden', opacity: disabled ? 0.4 : 1 }}
      >
        <Layer color={colors.text} />
        {/* Lumière + libellé inversé, découpés par la progression */}
        <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: 0, top: 0, bottom: 0, overflow: 'hidden', backgroundColor: fillBg }, fill]}>
          <Layer color={fillFg} />
        </Animated.View>
      </RNPressable>
    </Animated.View>
  );
}
