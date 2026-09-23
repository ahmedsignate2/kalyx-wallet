/**
 * Toasts (bandeaux de feedback) — remplacent les Alert.alert gris de l'OS pour
 * tout retour NON bloquant (succès, erreur, info).
 *
 * FILE D'ATTENTE (docs/08 §12.2) : un seul à la fois, les suivants attendent
 * leur tour. Avant, chaque appel écrasait le précédent : deux événements
 * rapprochés — ce qui arrive tout le temps, une transaction qui part puis se
 * confirme — et le premier message n'était jamais lu.
 *
 * Les confirmations avec boutons (reset, envoi…) restent des Alert/modales, et
 * une erreur qui demande une action va dans l'écran, pas ici (§12.2).
 */
import { create } from 'zustand';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface ToastData {
  id: number;
  type: ToastType;
  title: string;
  message?: string;
}

/** Au-delà, la file est vidée des plus anciens : personne ne lit dix bandeaux. */
const MAX_QUEUE = 3;

interface ToastState {
  current: ToastData | null;
  queue: ToastData[];
  show: (t: Omit<ToastData, 'id'>) => void;
  /** Ferme le bandeau courant et affiche le suivant s'il y en a un. */
  hide: () => void;
}

let seq = 0;

export const useToastStore = create<ToastState>((set, get) => ({
  current: null,
  queue: [],

  show: (t) => {
    const item: ToastData = { ...t, id: ++seq };
    const s = get();
    if (!s.current) return set({ current: item });
    // Doublon immédiat du bandeau affiché : inutile de le répéter.
    if (s.current.type === t.type && s.current.title === t.title && s.current.message === t.message) return;
    set({ queue: [...s.queue, item].slice(-MAX_QUEUE) });
  },

  hide: () => {
    const [next, ...rest] = get().queue;
    set({ current: next ?? null, queue: rest });
  },
}));

/** API pratique : `toast.success('Copié')`, `toast.error('Échec', 'détail')`… */
export const toast = {
  success: (title: string, message?: string) => useToastStore.getState().show({ type: 'success', title, message }),
  error: (title: string, message?: string) => useToastStore.getState().show({ type: 'error', title, message }),
  info: (title: string, message?: string) => useToastStore.getState().show({ type: 'info', title, message }),
  warning: (title: string, message?: string) => useToastStore.getState().show({ type: 'warning', title, message }),
};
