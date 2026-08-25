import React, { useEffect, useRef } from 'react';
import { Animated, Linking, Modal, Text, View } from 'react-native';
import Svg, { Circle, Path, G } from 'react-native-svg';

import { Button } from './components';
import { fonts, radii, spacing, useTheme } from './theme';
import { useT } from '../lib/settingsStore';
import { haptic } from '../lib/haptics';
import { sound } from '../lib/sound';

const AnimatedPath = Animated.createAnimatedComponent(Path);
const AnimatedG = Animated.createAnimatedComponent(G);
const CHECK_LEN = 40; // longueur approx. du tracé de la coche (~38 px, dash)

export function SuccessModal({
  visible,
  title,
  message,
  hash,
  explorerUrl,
  closeLabel,
  onClose,
}: {
  visible: boolean;
  title: string;
  message?: string;
  hash?: string;
  explorerUrl?: string;
  closeLabel?: string;
  onClose: () => void;
}) {
  const { colors, typography } = useTheme();
  const t = useT();
  const pop = useRef(new Animated.Value(0)).current; // scale + opacité du cercle
  const draw = useRef(new Animated.Value(CHECK_LEN)).current; // dashoffset de la coche
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!visible) return;
    pop.setValue(0);
    draw.setValue(CHECK_LEN);
    pulse.setValue(1);
    
    // Triptyque succès : haptique + son (§4.1 du plan de refonte).
    haptic.success();
    sound.success();

    Animated.sequence([
      Animated.spring(pop, { toValue: 1, useNativeDriver: true, tension: 100, friction: 6 }),
      Animated.timing(draw, { toValue: 0, duration: 200, useNativeDriver: false }),
    ]).start(() => {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulse, { toValue: 1.05, duration: 800, useNativeDriver: true }),
          Animated.timing(pulse, { toValue: 1, duration: 800, useNativeDriver: true }),
        ])
      ).start();
    });
  }, [visible, pop, draw, pulse]);

  if (!visible) return null;
  const short = hash && hash.length > 18 ? `${hash.slice(0, 10)}…${hash.slice(-8)}` : hash;

  return (
    <Modal transparent animationType="fade" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' }}>
        <View
          style={{
            backgroundColor: colors.bgDeep,
            borderTopLeftRadius: radii.xl,
            borderTopRightRadius: radii.xl,
            padding: spacing(3),
            paddingBottom: spacing(5),
            alignItems: 'center',
            gap: spacing(1.5),
          }}
        >
          <Animated.View style={{ opacity: pop, transform: [{ scale: pop }] }}>
            <Svg width={120} height={120} viewBox="0 0 96 96">
              {/* halo */}
              <Circle cx={48} cy={48} r={46} fill={colors.up} fillOpacity={0.12} />
              
              {/* pulsing green circle */}
              {/* @ts-ignore : SVG props typing for AnimatedG is incomplete */}
              <AnimatedG origin="48, 48" style={{ transform: [{ scale: pulse }] } as any}>
                <Circle cx={48} cy={48} r={36} fill={colors.up} fillOpacity={0.18} />
                <Circle cx={48} cy={48} r={28} fill={colors.up} />
                <AnimatedPath
                  d="M36 48 l9 9 l16 -19"
                  stroke={colors.bgDeep}
                  strokeWidth={5.5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  fill="none"
                  strokeDasharray={CHECK_LEN}
                  strokeDashoffset={draw}
                />
              </AnimatedG>
            </Svg>
          </Animated.View>

          <Text style={[typography.title, { textAlign: 'center' }]}>{title}</Text>
          {message ? <Text style={[typography.muted, { textAlign: 'center' }]}>{message}</Text> : null}
          {short ? (
            <Text style={{ color: colors.textFaint, fontSize: 13, fontVariant: ['tabular-nums'] }} selectable>
              {short}
            </Text>
          ) : null}
          {hash && explorerUrl ? (
            <Text
              onPress={() => Linking.openURL(`${explorerUrl}/tx/${hash}`)}
              style={{ color: colors.accent, fontFamily: fonts.semibold }}
            >
              {t('viewOnExplorer')} ↗
            </Text>
          ) : null}

          <View style={{ alignSelf: 'stretch', marginTop: spacing(1) }}>
            <Button label={closeLabel || t('done')} onPress={onClose} />
          </View>
        </View>
      </View>
    </Modal>
  );
}
