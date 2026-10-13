/**
 * LA CARTE KALYX — l'objet que l'utilisateur tient dans l'onglet Carte.
 *
 * C'est l'HABILLAGE Kalyx de la carte émise par un partenaire : Kalyx ne
 * connaît ni ses numéros ni son CVV (ils s'affichent chez l'émetteur). Le recto
 * n'affiche donc AUCUN faux numéro : le logo, la puce, le nom et l'émetteur. Le
 * verso dit où trouver les numéros. Un toucher la retourne (ressort, 3D).
 *
 * Trois matières : Holographique (reflet qui glisse lentement), Noir mat,
 * Crème Kalyx.
 */
import { useEffect } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { Easing, interpolate, useAnimatedStyle, useSharedValue, withRepeat, withSpring, withTiming } from 'react-native-reanimated';
import { Pressable, Text } from '../kit';
import { KalyxLogo } from '../KalyxLogo';
import { fontFamily, radii } from '../tokens';
import { useReduceMotion } from '../../lib/reduceMotion';
import { haptic } from '../../lib/haptics';
import type { CardTheme } from '../../lib/cardPrefs';

const RATIO = 1.586; // format ISO 7810 ID-1

const SKINS: Record<CardTheme, { bg: readonly [string, string, ...string[]]; ink: string; sub: string; chip: readonly [string, string]; sheen: number }> = {
  holo: { bg: ['#F7C6D9', '#C9B6F2', '#A9E4EC', '#F9DDB4'], ink: '#1D1A2B', sub: 'rgba(29,26,43,0.62)', chip: ['#F4E3B5', '#C9A85C'], sheen: 0.55 },
  noir: { bg: ['#2B2B33', '#17171C', '#0E0E12'], ink: '#F5F1EA', sub: 'rgba(245,241,234,0.55)', chip: ['#E8D6A6', '#A8853E'], sheen: 0.12 },
  creme: { bg: ['#FCF6EC', '#F1E6D3', '#E6D6BC'], ink: '#2A2117', sub: 'rgba(42,33,23,0.55)', chip: ['#EAD49C', '#B58E3E'], sheen: 0.35 },
};

function Chip({ colors }: { colors: readonly [string, string] }) {
  return (
    <LinearGradient colors={colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ width: 42, height: 32, borderRadius: 7, overflow: 'hidden' }}>
      {/* Pistes de la puce */}
      <View style={{ position: 'absolute', left: 13, top: 0, bottom: 0, width: 1, backgroundColor: 'rgba(0,0,0,0.18)' }} />
      <View style={{ position: 'absolute', right: 13, top: 0, bottom: 0, width: 1, backgroundColor: 'rgba(0,0,0,0.18)' }} />
      <View style={{ position: 'absolute', left: 0, right: 0, top: 15, height: 1, backgroundColor: 'rgba(0,0,0,0.18)' }} />
    </LinearGradient>
  );
}

export function KalyxCard({
  theme,
  holder,
  issuerName,
  backText,
  label,
  width: widthProp,
}: {
  theme: CardTheme;
  /** Nom affiché (profil), facultatif. */
  holder?: string;
  /** Émetteur choisi, ou rien tant qu'aucun n'est choisi. */
  issuerName?: string;
  /** Texte du verso (traduit par l'écran). */
  backText: string;
  /** Mention sous le logo (« Carte crypto »), traduite. */
  label: string;
  width?: number;
}) {
  const { width: screenW } = useWindowDimensions();
  const width = widthProp ?? Math.min(screenW - 40, 420);
  const height = width / RATIO;
  const skin = SKINS[theme];
  const reduce = useReduceMotion();

  /* Retournement : 0 = recto, 1 = verso. */
  const flip = useSharedValue(0);
  const toggle = () => {
    haptic.light();
    const to = flip.value > 0.5 ? 0 : 1;
    flip.value = reduce ? to : withSpring(to, { damping: 16, stiffness: 120, mass: 0.9 });
  };
  const frontStyle = useAnimatedStyle(() => ({
    opacity: flip.value < 0.5 ? 1 : 0,
    transform: [{ perspective: 1200 }, { rotateY: `${interpolate(flip.value, [0, 1], [0, 180])}deg` }],
  }));
  const backStyle = useAnimatedStyle(() => ({
    opacity: flip.value >= 0.5 ? 1 : 0,
    transform: [{ perspective: 1200 }, { rotateY: `${interpolate(flip.value, [0, 1], [180, 360])}deg` }],
  }));

  /* Reflet qui traverse lentement la carte (holographique surtout). */
  const sweep = useSharedValue(0);
  useEffect(() => {
    if (reduce) return;
    sweep.value = withRepeat(withTiming(1, { duration: 4200, easing: Easing.inOut(Easing.quad) }), -1, true);
  }, [reduce, sweep]);
  const sheenStyle = useAnimatedStyle(() => ({ transform: [{ translateX: interpolate(sweep.value, [0, 1], [-width, width]) }, { rotate: '20deg' }] }));

  const face = { position: 'absolute' as const, width, height, borderRadius: radii.xl, overflow: 'hidden' as const, backfaceVisibility: 'hidden' as const };

  return (
    <Pressable onPress={toggle} pressScale={0.98} accessibilityRole="button" accessibilityLabel={label} style={{ width, height, alignSelf: 'center' }}>
      {/* Ombre portée (vue séparée : le rognage des faces la couperait sur iOS). */}
      <View style={[StyleSheet.absoluteFill, { borderRadius: radii.xl, backgroundColor: skin.bg[1], shadowColor: '#000', shadowOpacity: theme === 'noir' ? 0.45 : 0.22, shadowRadius: 22, shadowOffset: { width: 0, height: 12 }, elevation: 12 }]} />

      {/* RECTO */}
      <Animated.View style={[face, frontStyle]}>
        <LinearGradient colors={skin.bg} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
        <Animated.View pointerEvents="none" style={[{ position: 'absolute', top: -height, bottom: -height, width: width * 0.35, opacity: skin.sheen }, sheenStyle]}>
          <LinearGradient colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0.9)', 'rgba(255,255,255,0)']} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={{ flex: 1 }} />
        </Animated.View>
        <View style={{ flex: 1, padding: 20, justifyContent: 'space-between' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <KalyxLogo size={26} />
              <Text style={{ color: skin.ink, fontFamily: fontFamily.bold, fontSize: 18, letterSpacing: 0.2 }}>Kalyx</Text>
            </View>
            {issuerName ? <Text style={{ color: skin.sub, fontFamily: fontFamily.semibold, fontSize: 12 }} numberOfLines={1}>{issuerName}</Text> : null}
          </View>
          <Chip colors={skin.chip} />
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' }}>
            <View style={{ flexShrink: 1 }}>
              <Text style={{ color: skin.sub, fontFamily: fontFamily.medium, fontSize: 11, letterSpacing: 1.2, textTransform: 'uppercase' }}>{label}</Text>
              {holder ? <Text style={{ color: skin.ink, fontFamily: fontFamily.semibold, fontSize: 15, marginTop: 2, letterSpacing: 0.6 }} numberOfLines={1}>{holder.toUpperCase()}</Text> : null}
            </View>
            {/* Sans contact */}
            <View style={{ flexDirection: 'row', gap: 2, alignItems: 'center' }}>
              {[10, 15, 20].map((h) => (
                <View key={h} style={{ width: h / 2.4, height: h, borderTopRightRadius: h, borderBottomRightRadius: h, borderWidth: 2, borderLeftWidth: 0, borderColor: skin.sub }} />
              ))}
            </View>
          </View>
        </View>
      </Animated.View>

      {/* VERSO */}
      <Animated.View style={[face, backStyle]}>
        <LinearGradient colors={skin.bg} start={{ x: 1, y: 0 }} end={{ x: 0, y: 1 }} style={StyleSheet.absoluteFill} />
        <View style={{ marginTop: 22, height: 40, backgroundColor: theme === 'creme' ? '#2A2117' : '#0B0B0E' }} />
        <View style={{ flex: 1, padding: 20, justifyContent: 'space-between' }}>
          <Text style={{ color: skin.ink, fontFamily: fontFamily.medium, fontSize: 14, lineHeight: 20 }}>{backText}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-end' }}>
            <KalyxLogo size={16} />
            <Text style={{ color: skin.sub, fontFamily: fontFamily.semibold, fontSize: 12 }}>Kalyx</Text>
          </View>
        </View>
      </Animated.View>
    </Pressable>
  );
}
