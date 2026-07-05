/**
 * Centre de notifications in-app : historique persisté des événements (tx
 * confirmées, alertes de prix…). `notifyAndLog` enregistre TOUJOURS dans le
 * centre et déclenche une notification OS si la catégorie est activée.
 */
import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { notify } from './notifications';
import { useSettings } from './settingsStore';

const KEY = 'nova.notifCenter';
const MAX = 100;

export type NotifType = 'tx' | 'price' | 'info';

export interface NotifItem {
  id: string;
  type: NotifType;
  title: string;
  body?: string;
  at: number;
  read: boolean;
}

interface NotifCenterState {
  items: NotifItem[];
  load: () => Promise<void>;
  push: (type: NotifType, title: string, body?: string) => void;
  markAllRead: () => void;
  clear: () => void;
}

let seq = 0;

function persist(items: NotifItem[]) {
  void AsyncStorage.setItem(KEY, JSON.stringify(items)).catch(() => {});
}

export const useNotifCenter = create<NotifCenterState>((set, get) => ({
  items: [],
  load: async () => {
    try {
      const raw = await AsyncStorage.getItem(KEY);
      set({ items: raw ? (JSON.parse(raw) as NotifItem[]) : [] });
    } catch {
      /* silencieux */
    }
  },
  push: (type, title, body) => {
    const item: NotifItem = { id: `n${Date.now()}${seq++}`, type, title, body, at: Date.now(), read: false };
    const items = [item, ...get().items].slice(0, MAX);
    set({ items });
    persist(items);
  },
  markAllRead: () => {
    const items = get().items.map((i) => ({ ...i, read: true }));
    set({ items });
    persist(items);
  },
  clear: () => {
    set({ items: [] });
    void AsyncStorage.removeItem(KEY).catch(() => {});
  },
}));

/** Nombre de non-lus (sélecteur pratique). */
export function unreadCount(items: NotifItem[]): number {
  return items.reduce((n, i) => n + (i.read ? 0 : 1), 0);
}

/**
 * Enregistre un événement dans le centre ET envoie une notification OS si la
 * catégorie est activée dans les réglages. Point d'entrée unique de l'app.
 */
export function notifyAndLog(type: NotifType, title: string, body?: string): void {
  useNotifCenter.getState().push(type, title, body);
  const s = useSettings.getState();
  const enabled = type === 'tx' ? s.notifTx : type === 'price' ? s.notifPrice : true;
  if (enabled) void notify(title, body ?? '');
}
