/**
 * Écran de succès de transaction : halo + cercle vert qui « pop » (spring),
 * coche dessinée au trait (strokeDashoffset animé), vibration de confirmation.
 * Le moment le plus émotionnel de l'app — soigné mais sobre.
 *
 * Zéro dépendance nouvelle : Animated + react-native-svg + Vibration.
 * (strokeDashoffset n'est pas supporté par le native driver → JS driver,
 * acceptable pour ~400 ms d'animation.)
 */
import React, { useEffect, useRef } from 'react';
import { Animated, Linking, Modal, Text, Vibration, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { Button } from './components';
import { fonts, radii, spacing, useTheme } from './theme';

const AnimatedPath = Animated.createAnimatedComponent(Path);
const CHECK_LEN = 40; // longueur approx. du tracé de la coche (~38 px, dash)

export function SuccessModal({
  visible,
  title,
  message,
  hash,
  explorerUrl,
  closeLabel = 'Terminé',
  onClose,
}: {
  visible: boolean;
  title: string;
  /** Résumé lisible (ex. « 0,05 ETH envoyés à 0x12…89 »). */
  message?: string;
  /** Hash de la transaction (affiché raccourci). */
  hash?: string;
  /** Base explorer (ex. https://etherscan.io) → lien « Voir sur l'explorateur ». */
  explorerUrl?: string;
  closeLabel?: string;
  onClose: () => void;
}) {
  const { colors, typography } = useTheme();
  const pop = useRef(new Animated.Value(0)).current; // scale + opacité du cercle
  const draw = useRef(new Animated.Value(CHECK_LEN)).current; // dashoffset de la coche

  useEffect(() => {
    if (!visible) return;
    pop.setValue(0);
    draw.setValue(CHECK_LEN);
    Vibration.vibrate([0, 40, 90, 40]); // double tick de confirmation
    Animated.sequence([
      Animated.spring(pop, { toValue: 1, useNativeDriver: false, speed: 14, bounciness: 12 }),
      Animated.timing(draw, { toValue: 0, duration: 320, useNativeDriver: false }),
    ]).start();
  }, [visible, pop, draw]);

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
              Voir sur l'explorateur ↗
            </Text>
          ) : null}

          <View style={{ alignSelf: 'stretch', marginTop: spacing(1) }}>
            <Button label={closeLabel} onPress={onClose} />
          </View>
        </View>
      </View>
    </Modal>
  );
}
