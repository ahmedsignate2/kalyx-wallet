/**
 * Mes achats (MoonPay) — gardés sur l'appareil.
 *
 * MoonPay exige un suivi de commande après l'achat ; le widget, lui, l'oublie
 * dès qu'on le ferme. On retient donc chaque commande (identifiant MoonPay,
 * ce qui a été acheté, son dernier état connu) pour pouvoir y revenir.
 * Rien de secret : ni carte, ni identité — ce que MoonPay renvoie à l'app.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

export interface BuyRecord {
  /** Identifiant de commande MoonPay. */
  id: string;
  at: number;
  /** Montant payé et devise (« 100 », « eur »). */
  fiatAmount: number;
  fiat: string;
  /** L'actif acheté (assez pour le réafficher). */
  code: string;
  symbol: string;
  name: string;
  chainId: string;
  contract: string | null;
  /** Dernier état connu chez MoonPay. */
  status: string;
  cryptoAmount: number | null;
  txHash: string | null;
}

const K = 'kalyx.buy.history';
const MAX = 30;

type State = {
  items: BuyRecord[];
  loaded: boolean;
  load: () => Promise<void>;
  /** Ajoute ou met à jour une commande (par identifiant). */
  upsert: (r: Partial<BuyRecord> & { id: string }) => void;
};

export const useBuyHistory = create<State>((set, get) => ({
  items: [],
  loaded: false,
  load: async () => {
    if (get().loaded) return;
    try {
      const raw = await AsyncStorage.getItem(K);
      const v = raw ? (JSON.parse(raw) as unknown) : [];
      const items = Array.isArray(v) ? (v as BuyRecord[]).filter((x) => x && typeof x.id === 'string' && typeof x.symbol === 'string').slice(0, MAX) : [];
      // Une commande ajoutée avant la fin du chargement n'est pas écrasée.
      const mine = get().items;
      set({ items: [...mine, ...items.filter((x) => !mine.some((m) => m.id === x.id))].slice(0, MAX), loaded: true });
    } catch {
      set({ loaded: true });
    }
  },
  upsert: (r) => {
    const items = get().items;
    const prev = items.find((x) => x.id === r.id);
    if (!prev && (r.symbol === undefined || r.code === undefined)) return; // pas assez pour l'afficher
    const next = prev ? { ...prev, ...r } : (r as BuyRecord);
    set({ items: [next, ...items.filter((x) => x.id !== r.id)].slice(0, MAX) });
    AsyncStorage.setItem(K, JSON.stringify(get().items)).catch(() => {});
  },
}));
