/**
 * Barre d'onglets principale — 4 onglets + bouton central Swap :
 * Accueil (agrégé multi-chaîne : tokens, NFT, activité) · Explorer · Earn · Plus.
 *
 * Elle appartient au navigateur d'onglets (`app/(tabs)/_layout.tsx`) et reste
 * montée d'un onglet à l'autre : les écrans ne se remontent plus à chaque
 * changement (fini les saccades), et l'animation de l'onglet actif se voit.
 */
import React, { useEffect } from 'react';
import { router } from 'expo-router';
import type { BottomTabBarProps } from 'expo-router/tabs';
import Reanimated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { create } from 'zustand';
import { BottomNav } from './premium';
import { useT } from '../lib/settingsStore';
import { durations } from './tokens';

export type MainTab = 'home' | 'browser' | 'earn' | 'menu';

/** Un onglet peut masquer la barre (le navigateur, quand une dApp occupe l'écran). */
export const useTabBar = create<{ hidden: boolean; setHidden: (h: boolean) => void }>((set) => ({
  hidden: false,
  setHidden: (hidden) => set({ hidden }),
}));

export function AppTabBar({ state, navigation }: BottomTabBarProps) {
  const t = useT();
  const hidden = useTabBar((s) => s.hidden);
  const active = state.routes[state.index]?.name as MainTab;
  const y = useSharedValue(hidden ? 1 : 0);
  useEffect(() => {
    y.value = withTiming(hidden ? 1 : 0, { duration: durations.themeCrossfade });
  }, [hidden, y]);
  const style = useAnimatedStyle(() => ({ transform: [{ translateY: y.value * 140 }], opacity: 1 - y.value }));
  const go = (name: MainTab) => () => navigation.navigate(name);
  return (
    <Reanimated.View pointerEvents={hidden ? 'none' : 'box-none'} style={[{ position: 'absolute', left: 0, right: 0, bottom: 0 }, style]}>
      <BottomNav
        active={active}
        center={{ icon: 'exchange', label: t('navExchange'), onPress: () => router.push('/swap') }}
        items={[
          { key: 'home', icon: 'home', label: t('navHome'), onPress: go('home') },
          { key: 'browser', icon: 'dapps', label: t('navExplore'), onPress: go('browser') },
          { key: 'earn', icon: 'staking', label: 'Earn', onPress: go('earn') },
          { key: 'menu', icon: 'menu', label: t('menu'), onPress: go('menu') },
        ]}
      />
    </Reanimated.View>
  );
}
