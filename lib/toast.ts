/**
 * Toasts (bandeaux de feedback) — remplacent les Alert.alert gris de l'OS pour
 * tout retour NON bloquant (succès, erreur, info). Store zustand : déclenchable
 * depuis n'importe où, y compris hors composant (`toast.success(...)`).
 *
 * Les confirmations avec boutons (reset, envoi…) restent des Alert/modales.
 */
import { create } from 'zustand';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface ToastData {
  id: number;
  type: ToastType;
  title: string;
  message?: string;
}

interface ToastState {
  current: ToastData | null;
  show: (t: Omit<ToastData, 'id'>) => void;
  hide: () => void;
}

let seq = 0;

export const useToastStore = create<ToastState>((set) => ({
  current: null,
  show: (t) => set({ current: { ...t, id: ++seq } }),
  hide: () => set({ current: null }),
}));

/** API pratique : `toast.success('Copié')`, `toast.error('Échec', 'détail')`… */
export const toast = {
  success: (title: string, message?: string) => useToastStore.getState().show({ type: 'success', title, message }),
  error: (title: string, message?: string) => useToastStore.getState().show({ type: 'error', title, message }),
  info: (title: string, message?: string) => useToastStore.getState().show({ type: 'info', title, message }),
  warning: (title: string, message?: string) => useToastStore.getState().show({ type: 'warning', title, message }),
};
