/**
 * Barre d'onglets — celle de la maquette.
 *
 *   Accueil · Explorer · ( ⇄ ) · Activité · Réglages
 *
 *  1. Une barre FLOTTANTE aux coins arrondis, de la matière du thème (papier
 *     Crème avec une ombre douce, ou Nuit avec un liseré de lumière).
 *  2. L'onglet actif est posé dans une pastille qui GLISSE d'un onglet à
 *     l'autre au ressort ; son icône passe à l'encre, son libellé en gras.
 *  3. Au centre, le bouton SWAP en relief : un disque d'encre cerclé du fond,
 *     qui dépasse de la barre. Un appui ouvre l'échange ; un appui LONG ouvre
 *     l'éventail des quatre gestes de l'argent (Envoyer, Recevoir, Swap,
 *     Scanner), chacun à sa teinte, au-dessus du pouce.
 *
 * Elle appartient au navigateur d'onglets (`app/(tabs)/_layout.tsx`) et reste
 * montée d'un onglet à l'autre. « Gagner » reste un onglet du navigateur (les
 * tuiles de l'accueil y mènent) mais n'a plus de place dans la barre.
 */
import { useEffect, useEffectEvent, useState } from 'react';
import { Platform, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import type { BottomTabBarProps } from 'expo-router/tabs';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Reanimated, { interpolate, useAnimatedStyle, useSharedValue, withSpring, withTiming, type SharedValue } from 'react-native-reanimated';
import { create } from 'zustand';
import { useT } from '../lib/settingsStore';
import type { Key } from '../lib/i18n';
import { useReduceMotion } from '../lib/reduceMotion';
import { haptic } from '../lib/haptics';
import { durations, springs, radii, fontFamily, BRAND_GOLD, type ActionTint } from './tokens';
import { useTheme } from './theme';
import { Icon, type IconName } from './icon';
import { Pressable as KPressable, Text } from './kit';
import Svg, { Circle, Defs, LinearGradient as SvgLinearGradient, Stop } from 'react-native-svg';

export type MainTab = 'home' | 'browser' | 'activity' | 'menu';

/** Un onglet peut masquer la barre (le navigateur, quand une dApp occupe l'écran). */
export const useTabBar = create<{ hidden: boolean; setHidden: (h: boolean) => void }>((set) => ({
  hidden: false,
  setHidden: (hidden) => set({ hidden }),
}));

/** Or de la marque (logo) : exporté pour les écrans qui le citent encore. */
export const GOLD = BRAND_GOLD.light;
const NAV_H = 70;
/** Diamètre du bouton central, et de combien il dépasse au-dessus de la barre. */
const ORB = 60;
const ORB_LIFT = 18;
/** Anneau du fond autour du bouton central : il « découpe » la barre. */
const ORB_RING = 5;

const TABS: { key: MainTab; icon: IconName; label: (t: (k: Key) => string) => string }[] = [
  { key: 'home', icon: 'home', label: (t) => t('navHome') },
  { key: 'browser', icon: 'dapps', label: (t) => t('navExplore') },
  { key: 'activity', icon: 'history', label: (t) => t('activity') },
  { key: 'menu', icon: 'gear', label: (t) => t('settings') },
];
/** Cinq emplacements : deux onglets, le bouton central, deux onglets. */
const slotOf = (tabIdx: number) => (tabIdx < 2 ? tabIdx : tabIdx + 1);

/** Chaque geste garde SA teinte (tokens `tints`) : la même que sur l'accueil. */
const FAN: { icon: IconName; label: (t: (k: Key) => string) => string; go: () => void; tint: ActionTint }[] = [
  { icon: 'send', label: (t) => t('actionSend'), go: () => router.push('/send'), tint: 'send' },
  { icon: 'receive', label: (t) => t('actionReceive'), go: () => router.push('/receive'), tint: 'receive' },
  { icon: 'exchange', label: (t) => t('actionSwap'), go: () => router.push('/swap'), tint: 'swap' },
  { icon: 'scan', label: (t) => t('scan'), go: () => router.push('/scan'), tint: 'buy' },
];
/** Arc de l'éventail, au-dessus du bouton central (angles en degrés, rayon en px). */
const FAN_R = 132;
const FAN_ANGLES = [-158, -116, -64, -22].map((d) => (d * Math.PI) / 180);

function NavItem({ icon, label, on }: { icon: IconName; label: string; on: boolean }) {
  const { colors } = useTheme();
  const reduce = useReduceMotion();
  const p = useSharedValue(on ? 1 : 0);
  useEffect(() => {
    p.value = reduce ? (on ? 1 : 0) : withSpring(on ? 1 : 0, springs.snappy);
  }, [on, reduce, p]);
  const iconStyle = useAnimatedStyle(() => ({ transform: [{ scale: 1 + 0.06 * p.value }] }));
  return (
    <View style={{ alignItems: 'center', gap: 3 }}>
      <Reanimated.View style={iconStyle}>
        <Icon name={icon} size={22} color={on ? colors.text : colors.textTertiary} />
      </Reanimated.View>
      {/* Barre de hauteur FIXE (NAV_H) : libellé plafonné à 1,2× sous Dynamic Type. */}
      <Text variant="micro" numberOfLines={1} maxFontSizeMultiplier={1.2} style={{ fontFamily: on ? fontFamily.bold : fontFamily.medium, letterSpacing: 0.1, color: on ? colors.text : colors.textTertiary }}>{label}</Text>
    </View>
  );
}

/**
 * Une action de l'éventail. Posée à sa place FINALE dans un calque plein écran,
 * et l'animation la fait venir du bouton central (translation inverse qui s'annule).
 *
 * POURQUOI : elle était dessinée hors du cadre de la barre. Sur Android, un
 * toucher hors des limites du parent n'est jamais distribué à l'enfant : les
 * boutons s'affichaient, et aucun ne répondait.
 */
function FanAction({ i, open, cx, cy, label, icon, tint, onPress }: { i: number; open: SharedValue<number>; cx: number; cy: number; label: string; icon: IconName; tint: ActionTint; onPress: () => void }) {
  const { colors, mode, tints } = useTheme();
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
  // En Nuit la teinte est translucide : posée sur une surface pleine, pas sur le voile.
  const bg = mode === 'dark' ? colors.surface2 : tints[tint].bg;
  const ink = tints[tint].ink;
  return (
    <Reanimated.View style={[{ position: 'absolute', left: cx + dx - 40, top: cy + dy - 28, width: 80, alignItems: 'center' }, style]}>
      <KPressable onPress={onPress} haptic="light" accessibilityRole="button" accessibilityLabel={label} hitSlop={6} style={{ alignItems: 'center', gap: 6 }}>
        <View style={{ width: 56, height: 56, borderRadius: radii.full, backgroundColor: bg, overflow: 'hidden', borderWidth: 1, borderColor: mode === 'dark' ? colors.rim : 'rgba(255,255,255,0.8)' }}>
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: mode === 'dark' ? tints[tint].bg : 'transparent' }}>
            <Icon name={icon} size={23} color={ink} />
          </View>
        </View>
        {/* Colonne de 80 px posée sur l'arc : libellé plafonné à 1,2× (Dynamic Type). */}
        <Text variant="micro" numberOfLines={1} maxFontSizeMultiplier={1.2} style={{ color: colors.text, fontFamily: fontFamily.semibold }}>{label}</Text>
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
  // « Gagner » (hors barre) : aucune pastille, aucun onglet allumé.
  const activeIdx = TABS.findIndex((x) => x.key === active);
  const [w, setW] = useState(0);
  const slot = w / 5;
  const dark = mode === 'dark';
  const bottom = Math.max(insets.bottom, 12) + 6;
  const pillW = Math.max(0, Math.min(76, slot - 4));

  const y = useSharedValue(hidden ? 1 : 0);
  useEffect(() => {
    y.value = withTiming(hidden ? 1 : 0, { duration: durations.themeCrossfade });
  }, [hidden, y]);
  const dockStyle = useAnimatedStyle(() => ({ transform: [{ translateY: y.value * 160 }], opacity: 1 - y.value }));

  /* PASTILLE de l'onglet actif : elle glisse au ressort d'un onglet à l'autre. */
  const pillX = useSharedValue(-1);
  const pillOn = useSharedValue(activeIdx >= 0 ? 1 : 0);
  useEffect(() => {
    if (!slot) return;
    pillOn.value = withTiming(activeIdx >= 0 ? 1 : 0, { duration: 160 });
    if (activeIdx < 0) return;
    const x = slotOf(activeIdx) * slot + (slot - pillW) / 2;
    pillX.value = reduce || pillX.value < 0 ? x : withSpring(x, { damping: 20, stiffness: 260, mass: 0.8 });
  }, [activeIdx, slot, pillW, reduce, pillX, pillOn]);
  const pillStyle = useAnimatedStyle(() => ({ opacity: pillOn.value, transform: [{ translateX: Math.max(0, pillX.value) }] }));

  /* ÉVENTAIL : appui long sur le bouton central. */
  const open = useSharedValue(0);
  const [fanOpen, setFanOpen] = useState(false);
  const setFan = (o: boolean) => {
    setFanOpen(o);
    if (o) haptic.medium();
    open.value = reduce ? (o ? 1 : 0) : o ? withSpring(1, { damping: 15, stiffness: 140, mass: 0.9 }) : withTiming(0, { duration: 180 });
  };
  // Changer d'onglet referme l'éventail.
  const closeFan = useEffectEvent(() => {
    if (fanOpen) setFan(false);
  });
  useEffect(() => {
    closeFan();
  }, [activeIdx]);
  const scrimStyle = useAnimatedStyle(() => ({ opacity: Math.min(1, open.value) }));
  const orbIconStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${open.value * 90}deg` }] }));
  const swapIconStyle = useAnimatedStyle(() => ({ opacity: 1 - Math.min(1, open.value) }));
  const closeStyle = useAnimatedStyle(() => ({ opacity: Math.min(1, open.value) }));

  // Taille de l'écran (calque de l'éventail) : le centre du bouton s'en déduit.
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
      <Reanimated.View pointerEvents={fanOpen ? 'auto' : 'none'} style={[StyleSheet.absoluteFill, { backgroundColor: dark ? 'rgba(5,5,8,0.8)' : 'rgba(244,238,229,0.88)' }, scrimStyle]}>
        <KPressable noScale onPress={() => setFan(false)} accessibilityLabel={t('close')} style={{ flex: 1 }}>
          <View />
        </KPressable>
      </Reanimated.View>

      {/*
        Le cadre de la barre COMMENCE au sommet du bouton central : un parent qui
        s'arrêtait à la barre laissait le haut du bouton hors limites, donc mort
        au toucher sur Android.
      */}
      <Reanimated.View pointerEvents={hidden ? 'none' : 'box-none'} style={[{ position: 'absolute', left: 14, right: 14, bottom, paddingTop: ORB_LIFT }, dockStyle]}>
        {/*
          Ombre et rognage sur DEUX vues : sur iOS, `overflow: 'hidden'` rogne
          aussi l'ombre de la vue qui le porte. L'externe porte l'ombre (iOS),
          l'interne rogne et garde l'`elevation` (Android).
        */}
        <View
          onLayout={(e: LayoutChangeEvent) => setW(e.nativeEvent.layout.width)}
          style={Platform.OS === 'ios' ? { borderRadius: radii.xxl, shadowColor: dark ? '#000' : '#5A3A18', shadowOpacity: dark ? 0.5 : 0.14, shadowRadius: 22, shadowOffset: { width: 0, height: 10 } } : undefined}
        >
          <View
            style={{
              height: NAV_H,
              borderRadius: radii.xxl,
              backgroundColor: colors.surface1,
              borderWidth: 1,
              borderColor: colors.border,
              borderTopColor: colors.rim,
              flexDirection: 'row',
              alignItems: 'center',
              overflow: 'hidden',
              elevation: 14,
            }}
          >
            {slot ? (
              <Reanimated.View pointerEvents="none" style={[{ position: 'absolute', left: 0, top: 8, height: NAV_H - 16, width: pillW, borderRadius: radii.lg, backgroundColor: colors.surface2 }, pillStyle]} />
            ) : null}
            {TABS.slice(0, 2).map((it) => (
              <TabButton key={it.key} it={it} active={active} t={t} onPress={() => navigation.navigate(it.key)} />
            ))}
            {/* Place du bouton central (dessiné au-dessus, en relief). */}
            <View style={{ flex: 1 }} />
            {TABS.slice(2).map((it) => (
              <TabButton key={it.key} it={it} active={active} t={t} onPress={() => navigation.navigate(it.key)} />
            ))}
          </View>
        </View>

        {/* ── LE BOUTON SWAP ── */}
        <View pointerEvents="box-none" style={{ position: 'absolute', left: 0, right: 0, top: -ORB_RING, alignItems: 'center' }}>
          <View style={{ width: ORB + ORB_RING * 2, height: ORB + ORB_RING * 2, borderRadius: radii.full, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' }}>
            <View style={Platform.OS === 'ios' ? { borderRadius: ORB / 2, shadowColor: dark ? '#000' : '#1E1C2A', shadowOpacity: dark ? 0.45 : 0.28, shadowRadius: 12, shadowOffset: { width: 0, height: 6 } } : undefined}>
              <KPressable
                onPress={() => (fanOpen ? setFan(false) : router.push('/swap'))}
                onLongPress={() => setFan(!fanOpen)}
                delayLongPress={320}
                haptic="light"
                overshoot
                accessibilityRole="button"
                accessibilityState={{ expanded: fanOpen }}
                accessibilityLabel={fanOpen ? t('close') : t('actionSwap')}
                accessibilityActions={[{ name: 'longpress', label: `${t('actionSend')} · ${t('actionReceive')} · ${t('scan')}` }]}
                onAccessibilityAction={(e) => { if (e.nativeEvent.actionName === 'longpress') setFan(!fanOpen); }}
                style={{ width: ORB, height: ORB, borderRadius: ORB / 2, backgroundColor: dark ? '#F6A57C' : colors.primary, alignItems: 'center', justifyContent: 'center', elevation: 16 }}
              >
                {/* Anneau pêche → lavande (le crépuscule de la marque) et reflet du haut. */}
                <Svg width={ORB} height={ORB} style={StyleSheet.absoluteFill} pointerEvents="none">
                  <Defs>
                    <SvgLinearGradient id="orb-ring" x1="0" y1="0" x2="1" y2="1">
                      <Stop offset="0" stopColor="#FFD2B0" />
                      <Stop offset="1" stopColor="#9C83EC" />
                    </SvgLinearGradient>
                    <SvgLinearGradient id="orb-sheen" x1="0" y1="0" x2="0" y2="1">
                      <Stop offset="0" stopColor="#FFFFFF" stopOpacity={dark ? 0.35 : 0.14} />
                      <Stop offset="0.55" stopColor="#FFFFFF" stopOpacity={0} />
                    </SvgLinearGradient>
                  </Defs>
                  <Circle cx={ORB / 2} cy={ORB / 2} r={ORB / 2 - 1} fill="url(#orb-sheen)" />
                  <Circle cx={ORB / 2} cy={ORB / 2} r={ORB / 2 - 1.25} fill="none" stroke="url(#orb-ring)" strokeWidth={2.5} />
                </Svg>
                <Reanimated.View style={orbIconStyle}>
                  <Reanimated.View style={swapIconStyle}>
                    <Icon name="exchange" size={25} color={dark ? '#16131F' : '#F6A57C'} />
                  </Reanimated.View>
                </Reanimated.View>
                <Reanimated.View pointerEvents="none" style={[{ position: 'absolute' }, closeStyle]}>
                  <Icon name="close" size={24} color={dark ? '#16131F' : '#F6A57C'} />
                </Reanimated.View>
              </KPressable>
            </View>
          </View>
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
              <FanAction key={i} i={i} open={open} cx={orbCx} cy={orbCy} label={f.label(t)} icon={f.icon} tint={f.tint} onPress={go(f.go)} />
            ))
          : null}
      </View>
    </>
  );
}

function TabButton({ it, active, t, onPress }: { it: (typeof TABS)[number]; active: MainTab; t: (k: Key) => string; onPress: () => void }) {
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
