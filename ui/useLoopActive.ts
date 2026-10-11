/**
 * Une animation en boucle ne tourne que si quelqu'un peut la voir : écran au
 * premier plan dans la navigation ET application active. Les onglets restent
 * montés : sans cela, l'orbite ou la pulsation de l'accueil continuaient à
 * consommer le thread UI derrière le navigateur ou le marché.
 *
 * Hors d'un navigateur (tableau de bord web, modale racine), seule l'activité
 * de l'application compte.
 */
import { useContext, useEffect, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { NavigationContext } from 'expo-router/build/react-navigation/native';

export function useForeground(): boolean {
  const [active, setActive] = useState(AppState.currentState === 'active');
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s: AppStateStatus) => setActive(s === 'active'));
    return () => sub.remove();
  }, []);
  return active;
}

function useScreenFocused(): boolean {
  const navigation = useContext(NavigationContext);
  const [focused, setFocused] = useState(() => navigation?.isFocused() ?? true);
  useEffect(() => {
    if (!navigation) return;
    setFocused(navigation.isFocused());
    const offFocus = navigation.addListener('focus', () => setFocused(true));
    const offBlur = navigation.addListener('blur', () => setFocused(false));
    return () => {
      offFocus();
      offBlur();
    };
  }, [navigation]);
  return focused;
}

export function useLoopActive(): boolean {
  const focused = useScreenFocused();
  const foreground = useForeground();
  return focused && foreground;
}
