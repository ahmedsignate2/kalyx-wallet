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
  /**
   * Incrémenté à chaque effacement : le navigateur, resté monté, oublie alors
   * les sites connectés qu'il garde en mémoire et prévient la page ouverte.
   */
  epoch: number;
  /**
   * Dernier site OUBLIÉ (écran des connexions) et son compteur : le navigateur
   * resté monté le retire de ses sites connectés en mémoire — sinon la page
   * ouverte gardait le compte et pouvait encore demander des signatures.
   */
  /** Hôtes révoqués depuis le dernier signal (une LISTE : « tout oublier » en retire plusieurs dans le même rendu). */
  revoked: { hosts: string[]; n: number } | null;
  load: () => Promise<void>;
  addConnection: (c: Omit<DappConnection, 'at'>) => void;
  /**
   * Oublie un site : retiré des connexions ET de la mémoire de reconnexion, et
   * `revoked` prévient le navigateur monté, qui le retire de ses connexions
   * actives (onglets normal et privé) et envoie `disconnect` à la page ouverte.
   */
  removeConnection: (host: string) => void;
  removeConnections: (hosts: readonly string[]) => void;
  addSignature: (s: Omit<SigEntry, 'at'>) => void;
  remember: (host: string) => void;
  isRemembered: (host: string) => boolean;
  clear: () => void;
}

/** Un site connu de l'écran « Sites connectés » : connecté, mémorisé, ou les deux. */
export interface KnownSite {
  host: string;
  url: string;
  title: string;
  /** Dernière connexion (absente pour un site seulement mémorisé). */
  at?: number;
  /** Reconnexion silencieuse (sans PIN) autorisée. */
  remembered: boolean;
  /** Dernière signature / transaction demandée par ce site. */
  lastSignatureAt?: number;
}

/** Fusionne connexions et sites mémorisés (un site par hôte), les plus récents d'abord. */
export function knownSites(connections: DappConnection[], remembered: string[], signatures: SigEntry[] = []): KnownSite[] {
  const lastSig = new Map<string, number>();
  for (const s of signatures) lastSig.set(s.host, Math.max(lastSig.get(s.host) ?? 0, s.at));
  const out = new Map<string, KnownSite>();
  for (const c of connections) {
    if (!c.host || out.has(c.host)) continue;
    out.set(c.host, { host: c.host, url: c.url, title: c.title || c.host, at: c.at, remembered: remembered.includes(c.host), lastSignatureAt: lastSig.get(c.host) });
  }
  for (const h of remembered) {
    if (!h || out.has(h)) continue;
    out.set(h, { host: h, url: `https://${h}`, title: h, remembered: true, lastSignatureAt: lastSig.get(h) });
  }
  return [...out.values()].sort((a, b) => (b.at ?? 0) - (a.at ?? 0));
}

export const useDappActivity = create<DappActivityState>((set, get) => ({
  connections: [],
  signatures: [],
  remembered: [],
  epoch: 0,
  revoked: null,

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

  removeConnection: (host) => get().removeConnections([host]),

  /*
   * Un seul `set` pour tous les hôtes : appeler removeConnection en boucle
   * remplaçait `revoked` à chaque tour, et le navigateur (rendu regroupé) ne
   * déconnectait que le DERNIER — les autres gardaient l'accès au compte.
   */
  removeConnections: (hosts) => {
    if (hosts.length === 0) return;
    const drop = new Set(hosts);
    const connections = get().connections.filter((x) => !drop.has(x.host));
    const remembered = get().remembered.filter((h) => !drop.has(h));
    set({ connections, remembered, revoked: { hosts: [...drop], n: (get().revoked?.n ?? 0) + 1 } });
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
    set({ connections: [], signatures: [], remembered: [], epoch: get().epoch + 1 });
    void AsyncStorage.multiRemove([CONN_KEY, SIG_KEY, REMEMBER_KEY]).catch(() => {});
  },
}));
