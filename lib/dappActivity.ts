/**
 * Journal d'activité des dApps du navigateur intégré : connexions au wallet et
 * signatures/transactions. Persisté (AsyncStorage) et affiché dans l'écran
 * WalletConnect sous « dApps connectées » — comme les sessions WC.
 *
 * Non sensible (hôtes + horodatage, jamais de clé ni de contenu signé complet).
 */
import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

const CONN_KEY = 'nova.dappConnections';
const SIG_KEY = 'nova.dappSignatures';
const REMEMBER_KEY = 'nova.dappRemembered';
const SIG_MAX = 50;

export interface DappConnection {
  host: string;
  url: string;
  title: string;
  at: number;
}
export type SigKind = 'sign' | 'typedData' | 'tx';
export interface SigEntry {
  host: string;
  kind: SigKind;
  at: number;
}

interface DappActivityState {
  connections: DappConnection[];
  signatures: SigEntry[];
  /** Hôtes « de confiance » : reconnexion sans re-demander le PIN. */
  remembered: string[];
  load: () => Promise<void>;
  addConnection: (c: Omit<DappConnection, 'at'>) => void;
  removeConnection: (host: string) => void;
  addSignature: (s: Omit<SigEntry, 'at'>) => void;
  remember: (host: string) => void;
  isRemembered: (host: string) => boolean;
  clear: () => void;
}

export const useDappActivity = create<DappActivityState>((set, get) => ({
  connections: [],
  signatures: [],
  remembered: [],

  load: async () => {
    try {
      const [c, s, r] = await Promise.all([
        AsyncStorage.getItem(CONN_KEY),
        AsyncStorage.getItem(SIG_KEY),
        AsyncStorage.getItem(REMEMBER_KEY),
      ]);
      set({
        connections: c ? (JSON.parse(c) as DappConnection[]) : [],
        signatures: s ? (JSON.parse(s) as SigEntry[]) : [],
        remembered: r ? (JSON.parse(r) as string[]) : [],
      });
    } catch {
      /* silencieux */
    }
  },

  remember: (host) => {
    if (!host || get().remembered.includes(host)) return;
    const remembered = [...get().remembered, host];
    set({ remembered });
    void AsyncStorage.setItem(REMEMBER_KEY, JSON.stringify(remembered)).catch(() => {});
  },
  isRemembered: (host) => get().remembered.includes(host),

  addConnection: (c) => {
    if (!c.host) return;
    const connections = [{ ...c, at: Date.now() }, ...get().connections.filter((x) => x.host !== c.host)].slice(0, 50);
    set({ connections });
    void AsyncStorage.setItem(CONN_KEY, JSON.stringify(connections)).catch(() => {});
  },

  removeConnection: (host) => {
    const connections = get().connections.filter((x) => x.host !== host);
    const remembered = get().remembered.filter((h) => h !== host);
    set({ connections, remembered });
    void AsyncStorage.setItem(CONN_KEY, JSON.stringify(connections)).catch(() => {});
    void AsyncStorage.setItem(REMEMBER_KEY, JSON.stringify(remembered)).catch(() => {});
  },

  addSignature: (s) => {
    if (!s.host) return;
    const signatures = [{ ...s, at: Date.now() }, ...get().signatures].slice(0, SIG_MAX);
    set({ signatures });
    void AsyncStorage.setItem(SIG_KEY, JSON.stringify(signatures)).catch(() => {});
  },

  clear: () => {
    set({ connections: [], signatures: [], remembered: [] });
    void AsyncStorage.multiRemove([CONN_KEY, SIG_KEY, REMEMBER_KEY]).catch(() => {});
  },
}));
