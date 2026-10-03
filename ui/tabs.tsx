/**
 * Barre d'onglets « Orbit Dock » — la signature de Kalyx.
 *
 * Trois idées, qu'aucun autre wallet n'a ensemble :
 *
 *  1. L'ORBE au centre. Le logo Kalyx, posé en relief au-dessus du dock dans
 *     un disque cerclé d'or, qui respire lentement. Le toucher ouvre un
 *     ÉVENTAIL : Envoyer, Recevoir, Swap, Scanner jaillissent en arc au-dessus
 *     du pouce, en cascade, au ressort. Les quatre gestes de l'argent sont à
 *     un pouce de n'importe quel onglet — sans quitter l'écran où l'on est.
 *
 *  2. L'indicateur ÉLASTIQUE. La lueur de l'onglet actif ne glisse pas d'un
 *     bloc : son bord avant part vite, son bord arrière suit au ressort plus
 *     souple. Elle s'étire pendant le trajet et se reforme à l'arrivée, comme
 *     une goutte de lumière. Un filet d'or souligne l'onglet actif.
 *
 *  3. La MATIÈRE. Verre sombre, reflet en haut, arête dorée très fine : le
 *     dock flotte au-dessus du contenu au lieu d'être une barre posée.
 *
 * Elle appartient au navigateur d'onglets (`app/(tabs)/_layout.tsx`) et reste
 * montée d'un onglet à l'autre.
 */
import React, { useEffect, useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import type { BottomTabBarProps } from 'expo-router/tabs';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Reanimated, {
  Easing,
  cancelAnimation,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { create } from 'zustand';
import { useT } from '../lib/settingsStore';
import { useReduceMotion } from '../lib/reduceMotion';
import { haptic } from '../lib/haptics';
import { durations, springs, BRAND_GOLD } from './tokens';
import { useTheme } from './theme';
import { Icon, type IconName } from './icon';
import { Pressable as KPressable, Text } from './kit';
import { fontFamily } from './tokens';
import { KalyxLogo } from './KalyxLogo';

export type MainTab = 'home' | 'browser' | 'earn' | 'menu';

/** Un onglet peut masquer la barre (le navigateur, quand une dApp occupe l'écran). */
export const useTabBar = create<{ hidden: boolean; setHidden: (h: boolean) => void }>((set) => ({
  hidden: false,
  setHidden: (hidden) => set({ hidden }),
}));

/** Or de la marque : le seul accent chaud de l'interface (Bible §2). */
export const GOLD = BRAND_GOLD.light;
const NAV_H = 68;
/** Diamètre de l'orbe central, et de combien il dépasse au-dessus du dock. */
const ORB = 62;
const ORB_LIFT = 20;
/** Largeur de la lueur de l'onglet actif (bornée par l'emplacement). */
const GLOW_W = 64;

const TABS: { key: MainTab; icon: IconName; label: (t: (k: any) => string) => string }[] = [
  { key: 'home', icon: 'home', label: (t) => t('navHome') },
  { key: 'browser', icon: 'dapps', label: (t) => t('navExplore') },
  { key: 'earn', icon: 'staking', label: (t) => t('actionEarn') },
  { key: 'menu', icon: 'menu', label: (t) => t('menu') },
];
/** Cinq emplacements : deux onglets, l'orbe, deux onglets. */
const slotOf = (tabIdx: number) => (tabIdx < 2 ? tabIdx : tabIdx + 1);

/** Les quatre gestes de l'argent, en éventail au-dessus de l'orbe. */
const FAN: { icon: IconName; label: (t: (k: any) => string) => string; go: () => void; tone?: 'primary' | 'gold' }[] = [
  { icon: 'send', label: (t) => t('actionSend'), go: () => router.push('/send'), tone: 'primary' },
  { icon: 'receive', label: (t) => t('actionReceive'), go: () => router.push('/receive') },
  { icon: 'exchange', label: (t) => t('actionSwap'), go: () => router.push('/swap') },
  { icon: 'scan', label: (t) => t('scan'), go: () => router.push('/scan'), tone: 'gold' },
];
/** Arc de l'éventail, au-dessus de l'orbe (angles en degrés, rayon en px). */
const FAN_R = 132;
const FAN_ANGLES = [-158, -116, -64, -22].map((d) => (d * Math.PI) / 180);

function NavItem({ icon, label, on }: { icon: IconName; label: string; on: boolean }) {
  const { colors } = useTheme();
  const reduce = useReduceMotion();
  const p = useSharedValue(on ? 1 : 0);
  useEffect(() => {
    p.value = reduce ? (on ? 1 : 0) : withSpring(on ? 1 : 0, springs.snappy);
  }, [on, reduce, p]);
  const iconStyle = useAnimatedStyle(() => ({ transform: [{ translateY: -2 * p.value }, { scale: 1 + 0.08 * p.value }] }));
  return (
    <View style={{ alignItems: 'center', gap: 4 }}>
      <Reanimated.View style={iconStyle}>
        <Icon name={icon} size={22} color={on ? colors.text : colors.textTertiary} />
      </Reanimated.View>
      <Text variant="micro" numberOfLines={1} style={{ fontFamily: on ? fontFamily.semibold : fontFamily.medium, fontSize: 10.5, letterSpacing: 0.1, color: on ? colors.text : colors.textTertiary }}>{label}</Text>
    </View>
  );
}

/**
 * Une action de l'éventail. Posée à sa place FINALE dans un calque plein écran,
 * et l'animation la fait venir de l'orbe (translation inverse qui s'annule).
 *
 * POURQUOI : elle était dessinée hors du cadre de la barre. Sur Android, un
 * toucher hors des limites du parent n'est jamais distribué à l'enfant : les
 * boutons s'affichaient, et aucun ne répondait.
 */
function FanAction({ i, open, cx, cy, label, icon, tone, onPress }: { i: number; open: SharedValue<number>; cx: number; cy: number; label: string; icon: IconName; tone?: 'primary' | 'gold'; onPress: () => void }) {
  const { colors, mode } = useTheme();
  const a = FAN_ANGLES[i];
  const dx = Math.cos(a) * FAN_R;
  const dy = Math.sin(a) * FAN_R;
  const style = useAnimatedStyle(() => {
    // Chaque action a sa fenêtre dans l'ouverture : la cascade naît d'une seule valeur.
    const local = interpolate(open.value, [i * 0.12, 0.64 + i * 0.12], [0, 1], 'clamp');
    return {
      opacity: Math.min(1, local * 1.6),
      transform: [{ translateX: -dx * (1 - local) }, { translateY: -dy * (1 - local) }, { scale: 0.4 + 0.6 * local }],
    };
  });
  const bg = tone === 'primary' ? colors.primary : colors.surface3;
  const ink = tone === 'primary' ? colors.onPrimary : tone === 'gold' ? (mode === 'dark' ? GOLD : BRAND_GOLD.deep) : colors.text;
  return (
    <Reanimated.View style={[{ position: 'absolute', left: cx + dx - 40, top: cy + dy - 28, width: 80, alignItems: 'center' }, style]}>
      <KPressable onPress={onPress} haptic="light" accessibilityRole="button" accessibilityLabel={label} hitSlop={6} style={{ alignItems: 'center', gap: 6 }}>
        <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: bg, alignItems: 'center', justifyContent: 'center', borderWidth: tone === 'primary' ? 0 : 1, borderColor: tone === 'gold' ? 'rgba(221,181,101,0.5)' : 'rgba(255,255,255,0.12)' }}>
          <Icon name={icon} size={23} color={ink} />
        </View>
        <Text variant="micro" numberOfLines={1} style={{ color: colors.text, fontFamily: fontFamily.semibold, fontSize: 11.5 }}>{label}</Text>
      </KPressable>
    </Reanimated.View>
  );
}

export function AppTabBar({ state, navigation }: BottomTabBarProps) {
  const t = useT();
  const { colors, mode } = useTheme();
  const insets = useSafeAreaInsets();
  const reduce = useReduceMotion();
  const hidden = useTabBar((s) => s.hidden);
  const active = state.routes[state.index]?.name as MainTab;
  const activeIdx = Math.max(0, TABS.findIndex((x) => x.key === active));
  const [w, setW] = useState(0);
  const slot = w / 5;
  const glowW = Math.min(GLOW_W, slot - 6);
  const dark = mode === 'dark';
  const bottom = Math.max(insets.bottom, 12) + 8;

  const y = useSharedValue(hidden ? 1 : 0);
  useEffect(() => {
    y.value = withTiming(hidden ? 1 : 0, { duration: durations.themeCrossfade });
  }, [hidden, y]);
  const dockStyle = useAnimatedStyle(() => ({ transform: [{ translateY: y.value * 160 }], opacity: 1 - y.value }));

  /*
   * INDICATEUR ÉLASTIQUE : deux bords, deux ressorts. Le bord du côté où l'on
   * va est raide (il part tout de suite), l'autre est souple (il traîne) :
   * la lueur s'étire pendant le trajet puis se referme sur l'onglet.
   */
  const left = useSharedValue(0);
  const right = useSharedValue(0);
  useEffect(() => {
    if (!slot) return;
    const l = slotOf(activeIdx) * slot + (slot - glowW) / 2;
    const r = l + glowW;
    if (reduce || right.value === 0) {
      left.value = l;
      right.value = r;
      return;
    }
    const goingRight = l > left.value;
    const lead = { damping: 18, stiffness: 320, mass: 0.6 };
    const trail = { damping: 16, stiffness: 120, mass: 0.9 };
    left.value = withSpring(l, goingRight ? trail : lead);
    right.value = withSpring(r, goingRight ? lead : trail);
  }, [activeIdx, slot, glowW, reduce, left, right]);
  const glowStyle = useAnimatedStyle(() => ({ left: left.value, width: Math.max(8, right.value - left.value) }));

  /* ORBE : respiration lente du cercle d'or, éventail à l'appui. */
  const breath = useSharedValue(0);
  useEffect(() => {
    if (reduce) return;
    breath.value = withRepeat(withTiming(1, { duration: 2600, easing: Easing.inOut(Easing.sin) }), -1, true);
    return () => cancelAnimation(breath);
  }, [reduce, breath]);
  const ringStyle = useAnimatedStyle(() => ({ opacity: 0.35 + 0.35 * breath.value, transform: [{ scale: 1 + 0.06 * breath.value }] }));

  const open = useSharedValue(0);
  const [fanOpen, setFanOpen] = useState(false);
  const setFan = (o: boolean) => {
    setFanOpen(o);
    if (o) haptic.medium();
    open.value = reduce ? (o ? 1 : 0) : o ? withSpring(1, { damping: 15, stiffness: 140, mass: 0.9 }) : withTiming(0, { duration: 180 });
  };
  // Changer d'onglet referme l'éventail.
  useEffect(() => {
    if (fanOpen) setFan(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIdx]);
  const scrimStyle = useAnimatedStyle(() => ({ opacity: Math.min(1, open.value) }));
  const orbIconStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${open.value * 135}deg` }, { scale: 1 - 0.12 * Math.min(1, open.value) }] }));
  const closeStyle = useAnimatedStyle(() => ({ opacity: Math.min(1, open.value), transform: [{ rotate: `${(1 - open.value) * -90}deg` }] }));
  const logoStyle = useAnimatedStyle(() => ({ opacity: 1 - Math.min(1, open.value) }));

  // Taille de l'écran (calque de l'éventail) : le centre de l'orbe s'en déduit.
  const [layer, setLayer] = useState({ w: 0, h: 0 });
  const orbCx = layer.w / 2;
  const orbCy = layer.h - bottom - NAV_H - ORB_LIFT + ORB / 2 - 14;

  const go = (fn: () => void) => () => {
    setFan(false);
    fn();
  };

  return (
    <>
      {/* Voile : assombrit l'écran sous l'éventail, et le referme au toucher. */}
      <Reanimated.View pointerEvents={fanOpen ? 'auto' : 'none'} style={[StyleSheet.absoluteFill, { backgroundColor: dark ? 'rgba(3,4,8,0.78)' : 'rgba(246,247,250,0.86)' }, scrimStyle]}>
        <KPressable noScale onPress={() => setFan(false)} accessibilityLabel={t('close')} style={{ flex: 1 }}>
          <View />
        </KPressable>
      </Reanimated.View>

      {/*
        Le cadre de la barre COMMENCE au sommet de l'orbe : un parent qui
        s'arrêtait au dock laissait le haut de l'orbe hors limites, donc mort
        au toucher sur Android.
      */}
      <Reanimated.View pointerEvents={hidden ? 'none' : 'box-none'} style={[{ position: 'absolute', left: 16, right: 16, bottom, paddingTop: ORB_LIFT }, dockStyle]}>
        <View
          onLayout={(e: LayoutChangeEvent) => setW(e.nativeEvent.layout.width)}
          style={{
            height: NAV_H,
            borderRadius: NAV_H / 2,
            backgroundColor: dark ? 'rgba(12,14,22,0.97)' : 'rgba(255,255,255,0.97)',
            borderWidth: 1,
            borderColor: dark ? 'rgba(255,255,255,0.08)' : colors.border,
            borderTopColor: dark ? 'rgba(221,181,101,0.28)' : 'rgba(184,134,58,0.25)',
            flexDirection: 'row',
            alignItems: 'center',
            overflow: 'hidden',
            shadowColor: '#000',
            shadowOpacity: dark ? 0.5 : 0.12,
            shadowRadius: 24,
            shadowOffset: { width: 0, height: 10 },
            elevation: 16,
          }}
        >
          {/* Reflet du verre : la lumière tombe d'en haut. */}
          <LinearGradient
            pointerEvents="none"
            colors={dark ? ['rgba(255,255,255,0.07)', 'rgba(255,255,255,0)'] : ['rgba(255,255,255,0.9)', 'rgba(255,255,255,0)']}
            style={{ position: 'absolute', left: 0, right: 0, top: 0, height: NAV_H / 2 }}
          />
          {slot ? (
            <Reanimated.View pointerEvents="none" style={[{ position: 'absolute', top: 7, height: NAV_H - 14, borderRadius: (NAV_H - 14) / 2, backgroundColor: dark ? 'rgba(242,244,250,0.075)' : 'rgba(6,7,13,0.05)', overflow: 'hidden' }, glowStyle]}>
              {/* Filet d'or au pied de l'onglet actif. */}
              <View style={{ position: 'absolute', bottom: 0, left: '30%', right: '30%', height: 2, borderRadius: 1, backgroundColor: GOLD }} />
            </Reanimated.View>
          ) : null}
          {TABS.slice(0, 2).map((it) => (
            <TabButton key={it.key} it={it} active={active} t={t} onPress={() => navigation.navigate(it.key)} />
          ))}
          {/* Place de l'orbe (dessiné au-dessus, en relief). */}
          <View style={{ flex: 1 }} />
          {TABS.slice(2).map((it) => (
            <TabButton key={it.key} it={it} active={active} t={t} onPress={() => navigation.navigate(it.key)} />
          ))}
        </View>

        {/* ── L'ORBE ── */}
        <View pointerEvents="box-none" style={{ position: 'absolute', left: 0, right: 0, top: 0, alignItems: 'center' }}>
          <KPressable
            onPress={() => setFan(!fanOpen)}
            haptic="light"
            overshoot
            accessibilityRole="button"
            accessibilityState={{ expanded: fanOpen }}
            accessibilityLabel={fanOpen ? t('close') : 'Kalyx'}
            style={{ width: ORB, height: ORB, alignItems: 'center', justifyContent: 'center' }}
          >
            {/* Cercle d'or qui respire autour de l'orbe. */}
            <Reanimated.View pointerEvents="none" style={[{ position: 'absolute', width: ORB + 12, height: ORB + 12, borderRadius: (ORB + 12) / 2, borderWidth: 1.5, borderColor: GOLD }, ringStyle]} />
            <View style={{ width: ORB, height: ORB, borderRadius: ORB / 2, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(221,181,101,0.55)', alignItems: 'center', justifyContent: 'center', backgroundColor: dark ? '#10131D' : '#FFFFFF', shadowColor: GOLD, shadowOpacity: 0.45, shadowRadius: 18, shadowOffset: { width: 0, height: 0 }, elevation: 18 }}>
              <LinearGradient pointerEvents="none" colors={dark ? ['rgba(221,181,101,0.22)', 'rgba(221,181,101,0)'] : ['rgba(221,181,101,0.3)', 'rgba(221,181,101,0)']} style={StyleSheet.absoluteFill} start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }} />
              <Reanimated.View style={orbIconStyle}>
                <Reanimated.View style={logoStyle}>
                  <KalyxLogo size={34} />
                </Reanimated.View>
              </Reanimated.View>
              <Reanimated.View pointerEvents="none" style={[{ position: 'absolute' }, closeStyle]}>
                <Icon name="close" size={24} color={colors.text} />
              </Reanimated.View>
            </View>
          </KPressable>
        </View>
      </Reanimated.View>

      {/* ── L'ÉVENTAIL : calque plein écran, chaque action dans ses limites ── */}
      <View
        pointerEvents={fanOpen ? 'box-none' : 'none'}
        style={StyleSheet.absoluteFill}
        onLayout={(e: LayoutChangeEvent) => setLayer({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
      >
        {layer.h
          ? FAN.map((f, i) => (
              <FanAction key={i} i={i} open={open} cx={orbCx} cy={orbCy} label={f.label(t)} icon={f.icon} tone={f.tone} onPress={go(f.go)} />
            ))
          : null}
      </View>
    </>
  );
}

function TabButton({ it, active, t, onPress }: { it: (typeof TABS)[number]; active: MainTab; t: (k: any) => string; onPress: () => void }) {
  return (
    <KPressable
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityState={{ selected: it.key === active }}
      accessibilityLabel={it.label(t)}
      style={{ flex: 1, height: NAV_H, alignItems: 'center', justifyContent: 'center' }}
    >
      <NavItem icon={it.icon} label={it.label(t)} on={it.key === active} />
    </KPressable>
  );
}
