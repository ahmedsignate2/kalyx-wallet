/**
 * HoldRing — « maintenir pour envoyer », version Nova : un disque Lumière
 * entouré d'un anneau qui se remplit pendant 1,2 s. Même grammaire que
 * HoldButton (ticks haptiques qui se resserrent, « clac » lourd, redescente
 * sans reproche si l'on lâche, action d'accessibilité « Confirmer ») ; seule la
 * forme change. À l'accomplissement : flash du halo, 40 particules, coche.
 *
 * `danger` : anneau et disque rouges, maintien porté à 2 s, pas d'éclat — un
 * envoi forcé malgré une alerte n'est pas un moment à célébrer.
 */
import React, { useEffect, useRef, useState } from 'react';
import { Pressable as RNPressable, View } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  runOnJS,
  useAnimatedProps,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';
import { Text } from './Text';
import { Icon, type IconName } from '../icon';
import { useTheme } from '../theme';
import { durations, springs } from '../tokens';
import { useT } from '../../lib/settingsStore';
import { haptic } from '../../lib/haptics';
import { SparkBurst } from './SparkBurst';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

const SIZE = 140;
const STROKE = 6;
const R = (SIZE - STROKE) / 2 - 1;
const CIRC = 2 * Math.PI * R;

export function HoldRing({
  hint,
  holdingHint,
  onComplete,
  icon = 'send',
  disabled,
  danger,
  durationMs = durations.holdToSend,
}: {
  /** Texte sous l'anneau au repos (« Maintiens pour envoyer »). */
  hint: string;
  /** Texte pendant le maintien (« Continue… »). */
  holdingHint?: string;
  onComplete: () => void;
  icon?: IconName;
  disabled?: boolean;
  danger?: boolean;
  durationMs?: number;
}) {
  const { colors } = useTheme();
  const t = useT();
  const reduced = useReducedMotion();
  const progress = useSharedValue(0);
  const flash = useSharedValue(0);
  const holding = useRef(false);
  const tick = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startedAt = useRef(0);
  const [isHolding, setIsHolding] = useState(false);
  const [done, setDone] = useState(0);
  const total = danger ? Math.max(durationMs, 2000) : durationMs;

  const stopTicks = () => {
    if (tick.current) { clearTimeout(tick.current); tick.current = null; }
  };
  const scheduleTick = () => {
    const p = Math.min(1, (Date.now() - startedAt.current) / total);
    tick.current = setTimeout(() => {
      if (!holding.current) return;
      haptic.selection();
      scheduleTick();
    }, 180 - p * 125);
  };

  // État COURANT, lu à la fin du maintien : il a pu changer pendant le geste.
  const disabledRef = useRef(disabled);
  disabledRef.current = disabled;
  const fire = () => {
    if (disabledRef.current) {
      // Bloqué PENDANT le maintien (simulation critique, adresse sosie) : rien ne part.
      cancel();
      progress.value = withSpring(0, springs.standard);
      return;
    }
    holding.current = false;
    stopTicks();
    setIsHolding(false);
    haptic.heavy();
    if (!danger) {
      setDone((n) => n + 1);
      if (!reduced) {
        flash.value = 0;
        flash.value = withTiming(1, { duration: 900, easing: Easing.out(Easing.quad) });
      }
    }
    // Le disque se relâche : le geste est accompli, l'anneau redescend doucement.
    progress.value = withTiming(0, { duration: 700 });
    onComplete();
  };
  const start = () => {
    if (disabled) return;
    holding.current = true;
    startedAt.current = Date.now();
    setIsHolding(true);
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
    setIsHolding(false);
    cancelAnimation(progress);
    if (progress.value < 1) progress.value = withSpring(0, springs.standard);
  };
  useEffect(() => stopTicks, []);
  // Bloqué, ou passé en mode danger (maintien plus long) pendant le geste : le maintien repart de zéro.
  useEffect(() => {
    if (holding.current) cancel();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [disabled, danger]);

  const ringProps = useAnimatedProps(() => ({ strokeDashoffset: CIRC * (1 - progress.value) }));
  const core = useAnimatedStyle(() => ({ transform: [{ scale: reduced ? 1 : 0.94 + progress.value * 0.06 }] }));
  const flashStyle = useAnimatedStyle(() => ({
    opacity: flash.value === 0 ? 0 : 0.9 * (1 - flash.value),
    transform: [{ scale: 0.4 + flash.value * 2.2 }],
  }));

  const accent = danger ? colors.danger : colors.primary;
  const ink = danger ? '#FFFFFF' : colors.onPrimary;

  return (
    <View style={{ alignItems: 'center', gap: 16, opacity: disabled ? 0.4 : 1 }}>
      <View style={{ width: SIZE, height: SIZE }}>
        <Animated.View
          pointerEvents="none"
          style={[{ position: 'absolute', left: SIZE / 2 - 80, top: SIZE / 2 - 80, width: 160, height: 160, borderRadius: 80, backgroundColor: '#CFE3FF' }, flashStyle]}
        />
        <RNPressable
          onPressIn={start}
          onPressOut={cancel}
          disabled={disabled}
          accessibilityRole="button"
          accessibilityLabel={hint}
          accessibilityHint={t('holdToConfirm')}
          accessibilityActions={[{ name: 'activate', label: t('pinValidate') }]}
          onAccessibilityAction={(e) => { if (e.nativeEvent.actionName === 'activate' && !disabled) fire(); }}
          style={{ width: SIZE, height: SIZE }}
        >
          <Svg width={SIZE} height={SIZE} style={{ position: 'absolute' }}>
            <Circle cx={SIZE / 2} cy={SIZE / 2} r={R} stroke={colors.surface2} strokeWidth={STROKE} fill="none" />
            <AnimatedCircle
              cx={SIZE / 2}
              cy={SIZE / 2}
              r={R}
              stroke={accent}
              strokeWidth={STROKE}
              strokeLinecap="round"
              fill="none"
              strokeDasharray={`${CIRC} ${CIRC}`}
              animatedProps={ringProps}
              transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
            />
          </Svg>
          <Animated.View style={[{ position: 'absolute', left: 14, top: 14, width: SIZE - 28, height: SIZE - 28, borderRadius: (SIZE - 28) / 2, backgroundColor: accent, alignItems: 'center', justifyContent: 'center' }, core]}>
            <Icon name={done ? 'check' : icon} size={done ? 40 : 34} color={ink} />
          </Animated.View>
        </RNPressable>
        {done ? <SparkBurst burstKey={done} /> : null}
      </View>
      <Text variant="body" style={{ color: isHolding ? colors.text : colors.textSecondary }}>
        {isHolding && holdingHint ? holdingHint : hint}
      </Text>
    </View>
  );
}
