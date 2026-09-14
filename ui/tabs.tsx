/**
 * Barre d'onglets principale — 4 onglets + bouton central Swap :
 * Accueil (agrégé multi-chaîne : tokens, NFT, activité) · Marché · Earn · Plus.
 * L'ancien onglet « Portefeuille » (doublon par réseau) a été retiré (§ retours).
 * Navigation par `replace` : comportement d'onglets (pas d'empilement).
 */
import React from 'react';
import { router } from 'expo-router';
import { BottomNav } from './premium';
import { useT } from '../lib/settingsStore';

export type MainTab = 'home' | 'browser' | 'earn' | 'menu';

export function AppTabBar({ active }: { active: MainTab }) {
  const t = useT();
  return (
    <BottomNav
      active={active}
      center={{ icon: 'exchange', label: t('navExchange'), onPress: () => router.push('/swap') }}
      items={[
        { key: 'home', icon: 'home', label: t('navHome'), onPress: () => router.replace('/home') },
        { key: 'browser', icon: 'dapps', label: t('navExplore'), onPress: () => router.replace({ pathname: '/browser', params: { tab: '1' } }) },
        { key: 'earn', icon: 'staking', label: 'Earn', onPress: () => router.replace('/earn') },
        { key: 'menu', icon: 'menu', label: t('menu'), onPress: () => router.replace('/menu') },
      ]}
    />
  );
}
