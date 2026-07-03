/**
 * Barre d'onglets principale, partagée par les écrans de premier niveau
 * (Accueil, Marché, Portefeuille, Menu) + bouton central Échanger.
 * Navigation par `replace` : comportement d'onglets (pas d'empilement).
 */
import React from 'react';
import { router } from 'expo-router';
import { BottomNav } from './premium';
import { useT } from '../lib/settingsStore';

export type MainTab = 'home' | 'market' | 'wallet' | 'menu';

export function AppTabBar({ active }: { active: MainTab }) {
  const t = useT();
  return (
    <BottomNav
      active={active}
      center={{ icon: '↕', label: t('navExchange'), onPress: () => router.push('/swap') }}
      items={[
        { key: 'home', icon: '🏠', label: t('navHome'), onPress: () => router.replace('/home') },
        { key: 'market', icon: '📊', label: t('navMarket'), onPress: () => router.replace('/market') },
        { key: 'wallet', icon: '👛', label: t('navWallet'), onPress: () => router.replace('/wallet') },
        { key: 'menu', icon: '☰', label: t('menu'), onPress: () => router.replace('/menu') },
      ]}
    />
  );
}
