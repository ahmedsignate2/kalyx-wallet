/**
 * Les quatre onglets principaux dans un VRAI navigateur d'onglets.
 *
 * Avant, passer d'un onglet à l'autre faisait un `router.replace` dans la pile :
 * l'écran quitté était détruit, l'arrivant remonté de zéro (listes, graphiques,
 * lectures du cache) pendant l'animation — d'où les saccades et les instants de
 * fond nu. Ici chaque onglet est monté une fois puis GARDÉ : y revenir est
 * immédiat, avec son défilement et son état. `freezeOnBlur` coupe le rendu des
 * onglets cachés ; le navigateur y garde sa page ouverte sans rechargement.
 */
import React from 'react';
import { Tabs } from 'expo-router/tabs';
import { Easing } from 'react-native';
import { AppTabBar } from '../../ui/tabs';
import { useTheme } from '../../ui/theme';
import { useReduceMotion } from '../../lib/reduceMotion';

export default function TabsLayout() {
  const { colors } = useTheme();
  const reduce = useReduceMotion();
  return (
    <Tabs
      backBehavior="history"
      tabBar={(props) => <AppTabBar {...props} />}
      screenOptions={{
        headerShown: false,
        lazy: true,
        freezeOnBlur: true,
        sceneStyle: { backgroundColor: colors.bg },
        // Glissement court + fondu : l'onglet d'arrivée vient du côté où il est dans la barre.
        animation: reduce ? 'none' : 'shift',
        transitionSpec: { animation: 'timing', config: { duration: 220, easing: Easing.out(Easing.cubic) } },
      }}
    >
      <Tabs.Screen name="home" />
      <Tabs.Screen name="browser" />
      <Tabs.Screen name="earn" />
      <Tabs.Screen name="menu" />
    </Tabs>
  );
}
