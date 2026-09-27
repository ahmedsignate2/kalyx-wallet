/**
 * La dApp « mise de côté » : le navigateur reste monté SOUS l'écran courant.
 *
 * Les onglets naviguent par `replace` : quitter le navigateur le démontait, et
 * y revenir rechargeait la page — la session du site et sa connexion au wallet
 * étaient perdues. Mettre de côté POUSSE l'accueil par-dessus le navigateur ;
 * y revenir le RETROUVE (`router.dismissTo`) au lieu d'en créer un nouveau.
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
