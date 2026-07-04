/**
 * Affiche le toast courant : bandeau qui glisse depuis le haut (translate +
 * fondu), icône + couleur par type, vibration à l'apparition, auto-fermeture,
 * tap pour fermer. Monté une fois dans _layout, au-dessus de tout.
 */
import React, { useEffect, useRef } from 'react';
import { Animated, Pressable, Text, Vibration, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon, type IconName } from './icon';
import { fonts, radii, spacing, useTheme } from './theme';
import { useToastStore, type ToastType } from '../lib/toast';

const CONF: Record<ToastType, { icon: IconName; tone: 'up' | 'danger' | 'accent' | 'warning'; vibrate: number | number[] }> = {
  success: { icon: 'check', tone: 'up', vibrate: 14 },
  error: { icon: 'warning', tone: 'danger', vibrate: [0, 40, 80, 40] },
  info: { icon: 'info', tone: 'accent', vibrate: 10 },
  warning: { icon: 'warning', tone: 'warning', vibrate: [0, 30] },
};

export function ToastHost() {
  const insets = useSafeAreaInsets();
  const { colors, mode } = useTheme();
  const current = useToastStore((s) => s.current);
  const hide = useToastStore((s) => s.hide);

  const y = useRef(new Animated.Value(-120)).current;
  const op = useRef(new Animated.Value(0)).current;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!current) return;
    const conf = CONF[current.type];
    Vibration.vibrate(conf.vibrate);
    Animated.parallel([
      Animated.spring(y, { toValue: 0, useNativeDriver: true, speed: 16, bounciness: 8 }),
      Animated.timing(op, { toValue: 1, duration: 180, useNativeDriver: true }),
    ]).start();

    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(dismiss, current.type === 'error' ? 4200 : 2600);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id]);

  const dismiss = () => {
    Animated.parallel([
      Animated.timing(y, { toValue: -120, duration: 220, useNativeDriver: true }),
      Animated.timing(op, { toValue: 0, duration: 200, useNativeDriver: true }),
    ]).start(() => hide());
  };

  if (!current) return null;
  const conf = CONF[current.type];
  const accent = colors[conf.tone];

  return (
    <Animated.View
      pointerEvents="box-none"
      style={{ position: 'absolute', top: insets.top + spacing(1), left: spacing(2), right: spacing(2), zIndex: 200, opacity: op, transform: [{ translateY: y }] }}
    >
      <Pressable onPress={dismiss}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: spacing(1.25),
            backgroundColor: mode === 'dark' ? colors.bgElevated : colors.card,
            borderWidth: 1,
            borderColor: colors.glassBorder,
            borderLeftWidth: 4,
            borderLeftColor: accent,
            borderRadius: radii.lg,
            paddingVertical: spacing(1.5),
            paddingHorizontal: spacing(1.75),
            shadowColor: '#000',
            shadowOpacity: 0.28,
            shadowRadius: 20,
            shadowOffset: { width: 0, height: 10 },
            elevation: 10,
          }}
        >
          <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: accent + '22', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name={conf.icon} size={20} color={accent} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.text, fontSize: 15, fontFamily: fonts.semibold }} numberOfLines={1}>
              {current.title}
            </Text>
            {current.message ? (
              <Text style={{ color: colors.textMuted, fontSize: 13, marginTop: 1 }} numberOfLines={2}>
                {current.message}
              </Text>
            ) : null}
          </View>
        </View>
      </Pressable>
    </Animated.View>
  );
}
