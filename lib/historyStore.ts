/**
 * Store Zustand persisté pour le cache de l'historique des transactions.
 * Hydratation instantanée à l'ouverture d'écran, fetch réseau en arrière-plan.
 * Si le réseau échoue, le cache est conservé (jamais effacé).
 */
import { create } from 'zustand';
import { getAdapter, type TxSummary } from '../src';

// Clé de cache : `${chainId}:${address}`
export function cacheKey(chain: string, address: string): string {
  return `${chain}:${address.toLowerCase()}`;
}

/**
 * Tableau vide PARTAGÉ, rendu quand une clé est absente du cache.
 *
 * Un `[]` neuf à chaque appel serait une nouvelle référence : le sélecteur
 * zustand la comparerait par identité, conclurait à un changement et
 * redéclencherait un rendu en boucle.
 */
const NO_TX: TxSummary[] = [];

/** Clé AsyncStorage pour la persistance. */
const STORAGE_KEY = 'nova.historyCache';

interface HistoryState {
  /** Transactions cachées par clé chain:address. */
  cache: Record<string, TxSummary[]>;
  /** État de chargement par clé. */
  loading: Record<string, boolean>;
  /** Timestamp du dernier fetch réussi par clé. */
  lastFetch: Record<string, number>;

  /** Récupère les transactions du cache (instantané, sans réseau). */
  getCached: (chain: string, address: string) => TxSummary[];
  /** Vérifie si un fetch est en cours pour cette clé. */
  isLoading: (chain: string, address: string) => boolean;
  /** Fetch depuis le réseau et met à jour le cache. Non-bloquant, ne throw jamais. */
  fetchHistory: (chain: string, address: string) => Promise<TxSummary[]>;
  /** Charge le cache persisté depuis AsyncStorage (appelé au démarrage). */
  hydrate: () => Promise<void>;
}

let AsyncStorage: { getItem: (k: string) => Promise<string | null>; setItem: (k: string, v: string) => Promise<void> } | null = null;

async function getStorage() {
  if (!AsyncStorage) {
    try {
      // Import dynamique pour éviter les problèmes au test.
      const mod = await import('./kv');
      AsyncStorage = mod as any;
    } catch {
      // Fallback silencieux si kv n'est pas disponible.
      AsyncStorage = {
        getItem: async () => null,
        setItem: async () => {},
      };
    }
  }
  return AsyncStorage;
}

/** Persiste le cache en arrière-plan (fire-and-forget). */
function persistCache(cache: Record<string, TxSummary[]>) {
  void (async () => {
    try {
      const storage = await getStorage();
      // On ne persiste que les 50 dernières tx par clé pour limiter la taille.
      const trimmed: Record<string, TxSummary[]> = {};
      for (const [k, v] of Object.entries(cache)) {
        trimmed[k] = v.slice(0, 50);
      }
      await storage!.setItem(STORAGE_KEY, JSON.stringify(trimmed));
    } catch {
      // Silencieux : la persistance est un bonus, pas une obligation.
    }
  })();
}

export const useHistoryStore = create<HistoryState>((set, get) => ({
  cache: {},
  loading: {},
  lastFetch: {},

  getCached: (chain, address) => {
    const key = cacheKey(chain, address);
    return get().cache[key] ?? [];
  },

  isLoading: (chain, address) => {
    const key = cacheKey(chain, address);
    return get().loading[key] ?? false;
  },

  fetchHistory: async (chain, address) => {
    const key = cacheKey(chain, address);
    set((s) => ({ loading: { ...s.loading, [key]: true } }));
    try {
      const txs = await getAdapter(chain).getHistory(address);
      set((s) => {
        const newCache = { ...s.cache, [key]: txs };
        persistCache(newCache);
        return {
          cache: newCache,
          lastFetch: { ...s.lastFetch, [key]: Date.now() },
        };
      });
      return txs;
    } catch {
      // En cas d'erreur réseau, on conserve le cache existant.
      return get().cache[key] ?? [];
    } finally {
      set((s) => ({ loading: { ...s.loading, [key]: false } }));
    }
  },

  hydrate: async () => {
    try {
      const storage = await getStorage();
      const raw = await storage!.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Record<string, TxSummary[]>;
        set({ cache: parsed });
      }
    } catch {
      // Cache corrompu ou absent : on repart de zéro.
    }
  },
}));

// Hydratation automatique au chargement du module.
void useHistoryStore.getState().hydrate();

/* ── Lecture RÉACTIVE du cache ───────────────────────────────────────────────
 *
 * `getCached` et `isLoading` sont des fonctions STABLES : un écran qui fait
 * `useHistoryStore((s) => s.getCached)` s'abonne à la fonction, pas aux
 * données. Quand `fetchHistory` remplit le cache, rien ne le prévient et la
 * liste reste vide — jusqu'à ce qu'un autre changement d'état provoque un
 * rendu, par exemple une simple pression sur un filtre, après quoi les
 * transactions apparaissent d'un coup. C'est exactement ce qu'on observait :
 * « Tout » vide à l'ouverture, et rempli dès qu'on touchait « Envoyé ».
 *
 * Ces crochets s'abonnent à la TRANCHE de cache concernée. Les garder ici, à
 * côté du magasin, évite que le prochain écran refasse la même erreur.
 */

/** Transactions cachées pour ce réseau et cette adresse, réactif. */
export function useCachedHistory(chain: string, address: string | undefined): TxSummary[] {
  return useHistoryStore((s) => (address ? s.cache[cacheKey(chain, address)] : undefined) ?? NO_TX);
}

/** Un chargement est-il en cours pour ce réseau et cette adresse ? Réactif. */
export function useHistoryLoading(chain: string, address: string | undefined): boolean {
  return useHistoryStore((s) => (address ? s.loading[cacheKey(chain, address)] : false) ?? false);
}

/** Tout le cache, pour un écran qui agrège plusieurs réseaux. Réactif. */
export function useHistoryCache(): Record<string, TxSummary[]> {
  return useHistoryStore((s) => s.cache);
}
