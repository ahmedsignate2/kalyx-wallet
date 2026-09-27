/**
 * La dApp « mise de côté » : l'onglet Explorer reste monté (navigateur
 * d'onglets), la page garde sa session et sa connexion au wallet. Ce store ne
 * sert qu'à le SIGNALER ailleurs — la pastille « Revenir sur … » de l'accueil.
 */
import { create } from 'zustand';

interface BrowserPresence {
  /** Page laissée ouverte, ou null si le navigateur n'est pas en arrière-plan. */
  parked: { url: string; title: string } | null;
  park: (page: { url: string; title: string }) => void;
  clear: () => void;
}

export const useBrowserPresence = create<BrowserPresence>((set) => ({
  parked: null,
  park: (page) => set({ parked: page }),
  clear: () => set({ parked: null }),
}));

export function hostOf(url: string): string {
  return url.replace(/^[a-z]+:\/\//i, '').split(/[/?#]/)[0] || url;
}
