/**
 * Barre d'onglets principale — « Nova » : une pilule flottante, quatre icônes,
 * un point d'or sous l'onglet actif. Échanger n'y figure plus : c'est un disque
 * d'action sur l'accueil, à côté d'Envoyer et Recevoir.
 *
 * Elle appartient au navigateur d'onglets (`app/(tabs)/_layout.tsx`) et reste
 * montée d'un onglet à l'autre : les écrans ne se remontent plus à chaque
 * changement, et la lumière glisse d'une icône à l'autre au lieu de sauter.
 */
import React, { useEffect, useState } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';
import type { BottomTabBarProps } from 'expo-router/tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Reanimated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { create } from 'zustand';
import { useT } from '../lib/settingsStore';
import { useReduceMotion } from '../lib/reduceMotion';
import { durations, springs, BRAND_GOLD } from './tokens';
import { useTheme } from './theme';
import { Icon, type IconName } from './icon';
import { Pressable as KPressable, Text } from './kit';
import { fontFamily } from './tokens';

export type MainTab = 'home' | 'browser' | 'earn' | 'menu';

/** Un onglet peut masquer la barre (le navigateur, quand une dApp occupe l'écran). */
export const useTabBar = create<{ hidden: boolean; setHidden: (h: boolean) => void }>((set) => ({
  hidden: false,
  setHidden: (hidden) => set({ hidden }),
}));

/** Or de la marque : le seul accent chaud de l'interface (Bible §2). */
export const GOLD = BRAND_GOLD.light;
const NAV_H = 68;
/** Largeur de la lueur de l'onglet actif (bornée par l'emplacement). */
const GLOW_W = 76;

const TABS: { key: MainTab; icon: IconName; label: (t: (k: any) => string) => string }[] = [
  { key: 'home', icon: 'home', label: (t) => t('navHome') },
  { key: 'browser', icon: 'dapps', label: (t) => t('navExplore') },
  { key: 'earn', icon: 'staking', label: (t) => t('actionEarn') },
  { key: 'menu', icon: 'menu', label: (t) => t('menu') },
];

/*
 * Icône + libellé : sans libellé la barre paraissait vide, et il fallait
 * deviner ce que cachait chaque glyphe. L'actif monte légèrement, s'éclaire,
 * et porte le point d'or au-dessus de l'icône.
 */
function NavItem({ icon, label, on }: { icon: IconName; label: string; on: boolean }) {
  const { colors } = useTheme();
  const reduce = useReduceMotion();
  const p = useSharedValue(on ? 1 : 0);
  useEffect(() => {
    p.value = reduce ? (on ? 1 : 0) : withSpring(on ? 1 : 0, springs.snappy);
  }, [on, reduce, p]);
  const iconStyle = useAnimatedStyle(() => ({ transform: [{ translateY: -1.5 * p.value }, { scale: 1 + 0.06 * p.value }] }));
  const dotStyle = useAnimatedStyle(() => ({ opacity: p.value, transform: [{ scale: p.value }] }));
  return (
    <View style={{ alignItems: 'center', gap: 3 }}>
      <Reanimated.View style={[{ width: 4, height: 4, borderRadius: 2, backgroundColor: GOLD, marginBottom: 1 }, dotStyle]} />
      <Reanimated.View style={iconStyle}>
        <Icon name={icon} size={22} color={on ? colors.text : colors.textTertiary} />
      </Reanimated.View>
      <Text variant="micro" numberOfLines={1} style={{ fontFamily: on ? fontFamily.semibold : fontFamily.medium, fontSize: 10.5, letterSpacing: 0.1, color: on ? colors.text : colors.textTertiary }}>{label}</Text>
    </View>
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
  const slot = w / TABS.length;
  const glowW = Math.min(GLOW_W, slot - 8);

  const y = useSharedValue(hidden ? 1 : 0);
  useEffect(() => {
    y.value = withTiming(hidden ? 1 : 0, { duration: durations.themeCrossfade });
  }, [hidden, y]);
  const style = useAnimatedStyle(() => ({ transform: [{ translateY: y.value * 140 }], opacity: 1 - y.value }));

  /* La lueur sous l'onglet actif GLISSE d'un emplacement à l'autre. */
  const x = useSharedValue(0);
  useEffect(() => {
    if (!slot) return;
    const to = activeIdx * slot + (slot - glowW) / 2;
    x.value = reduce || x.value === 0 ? to : withSpring(to, springs.standard);
  }, [activeIdx, slot, glowW, reduce, x]);
  const glowStyle = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));

  return (
    <Reanimated.View pointerEvents={hidden ? 'none' : 'box-none'} style={[{ position: 'absolute', left: 16, right: 16, bottom: Math.max(insets.bottom, 12) + 8 }, style]}>
      <View
        onLayout={(e: LayoutChangeEvent) => setW(e.nativeEvent.layout.width)}
        style={{
          height: NAV_H,
          borderRadius: NAV_H / 2,
          backgroundColor: mode === 'dark' ? 'rgba(14,16,25,0.96)' : 'rgba(255,255,255,0.97)',
          borderWidth: 1,
          borderColor: mode === 'dark' ? 'rgba(255,255,255,0.08)' : colors.border,
          flexDirection: 'row',
          alignItems: 'center',
          overflow: 'hidden',
        }}
      >
        {slot ? (
          <Reanimated.View
            pointerEvents="none"
            style={[{ position: 'absolute', left: 0, top: (NAV_H - 2 - 56) / 2, width: glowW, height: 56, borderRadius: 28, backgroundColor: mode === 'dark' ? 'rgba(242,244,250,0.07)' : 'rgba(6,7,13,0.05)', borderWidth: 1, borderColor: mode === 'dark' ? 'rgba(255,255,255,0.06)' : 'rgba(6,7,13,0.06)' }, glowStyle]}
          />
        ) : null}
        {TABS.map((it) => (
          <KPressable
            key={it.key}
            onPress={() => navigation.navigate(it.key)}
            accessibilityRole="tab"
            accessibilityState={{ selected: it.key === active }}
            accessibilityLabel={it.label(t)}
            style={{ flex: 1, height: NAV_H, alignItems: 'center', justifyContent: 'center' }}
          >
            <NavItem icon={it.icon} label={it.label(t)} on={it.key === active} />
          </KPressable>
        ))}
      </View>
    </Reanimated.View>
  );
}
