/**
 * Préférences de l'onglet Carte (non sensibles) : le style de la carte Kalyx
 * et l'émetteur choisi. Aucune donnée de carte n'est stockée ici — les
 * numéros vivent chez l'émetteur (src/domain/card/cardIssuers).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import type { CardIssuerId } from '../src/domain/card/cardIssuers';

export type CardTheme = 'holo' | 'noir' | 'creme';
export const CARD_THEMES: readonly CardTheme[] = ['holo', 'noir', 'creme'];

const K = 'kalyx.card.prefs';

type State = {
  theme: CardTheme;
  issuer: CardIssuerId | null;
  loaded: boolean;
  setTheme: (t: CardTheme) => void;
  setIssuer: (i: CardIssuerId) => void;
  load: () => Promise<void>;
};

const save = (s: { theme: CardTheme; issuer: CardIssuerId | null }) => {
  AsyncStorage.setItem(K, JSON.stringify(s)).catch(() => {});
};

export const useCardPrefs = create<State>((set, get) => ({
  theme: 'holo',
  issuer: null,
  loaded: false,
  setTheme: (theme) => {
    set({ theme });
    save({ theme, issuer: get().issuer });
  },
  setIssuer: (issuer) => {
    set({ issuer });
    save({ theme: get().theme, issuer });
  },
  load: async () => {
    if (get().loaded) return;
    try {
      const raw = await AsyncStorage.getItem(K);
      const v = raw ? (JSON.parse(raw) as { theme?: string; issuer?: string }) : {};
      set({
        theme: CARD_THEMES.includes(v.theme as CardTheme) ? (v.theme as CardTheme) : 'holo',
        issuer: (v.issuer as CardIssuerId) ?? null,
        loaded: true,
      });
    } catch {
      set({ loaded: true });
    }
  },
}));
