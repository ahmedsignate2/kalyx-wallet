/**
 * Store Zustand persisté pour le cache de l'historique des transactions.
 * Hydratation instantanée à l'ouverture d'écran, fetch réseau en arrière-plan.
 * Si le réseau échoue, le cache est conservé (jamais effacé).
 */
import { create } from 'zustand';
import { getAdapter, type ChainConfig, type TxSummary } from '../src';

/**
 * Ce qu'il faut d'une chaîne pour retrouver son adresse : la famille ne suffit
 * plus, l'adresse TON dépend aussi du réseau (la W5 du réseau de test diffère).
 */
export type HistoryChain = Pick<ChainConfig, 'id' | 'family' | 'testnet'>;

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
  /**
   * Fetch depuis le réseau et met à jour le cache. Ne throw jamais.
   * Sans `force`, une réponse de moins de HISTORY_FRESH_MS est réutilisée.
   */
  fetchHistory: (chain: string, address: string, opts?: { force?: boolean }) => Promise<TxSummary[]>;
  /** À appeler après un envoi : la prochaine demande pour cette clé ira au réseau. */
  markStale: (chain: string, address: string) => void;
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

/**
 * Âge sous lequel un historique est réutilisé sans réseau.
 *
 * Les onglets naviguent par `replace` : l'accueil et l'Historique sont
 * REMONTÉS à chaque passage, et chaque montage redemandait tous les réseaux —
 * une dizaine d'appels d'indexeur par changement d'onglet. Le geste « tirer
 * pour rafraîchir » et le suivi d'un envoi passent `force`.
 */
export const HISTORY_FRESH_MS = 60_000;

/** Demandes en cours par clé : deux écrans qui demandent la même chose n'en font qu'une. */
const inflight = new Map<string, Promise<TxSummary[]>>();

/*
 * Clés à redemander quoi qu'il arrive (après un envoi). À part de `lastFetch` :
 * le remettre à zéro ferait croire aux écrans que le réseau n'a jamais répondu.
 */
const stale = new Set<string>();

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

export const useHistoryStore = create<HistoryState>((set, get) => {
  /** L'appel réseau lui-même ; `fetchHistory` décide s'il a lieu. */
  const fetchFromNetwork = async (key: string, chain: string, address: string): Promise<TxSummary[]> => {
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
  };

  return {
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

    fetchHistory: (chain, address, opts) => {
      const key = cacheKey(chain, address);
      const running = inflight.get(key);
      if (running) return running;
      const s0 = get();
      if (!opts?.force && !stale.has(key) && s0.cache[key] && Date.now() - (s0.lastFetch[key] ?? 0) < HISTORY_FRESH_MS) {
        return Promise.resolve(s0.cache[key]);
      }
      stale.delete(key);
      const request = fetchFromNetwork(key, chain, address).finally(() => inflight.delete(key));
      inflight.set(key, request);
      return request;
    },

    markStale: (chain, address) => {
      stale.add(cacheKey(chain, address));
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
  };
});

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

/**
 * Agrège l'historique de plusieurs réseaux depuis le cache.
 *
 * Pure, et partagée par l'accueil et l'écran Historique : les deux montraient la
 * même chose de deux façons différentes, et l'accueil contournait complètement
 * ce cache — il appelait les adaptateurs en direct, avec un `Promise.all` qui
 * n'affichait RIEN avant que les huit réseaux aient répondu. Un seul indexeur
 * lent, et la liste restait vide plusieurs dizaines de secondes.
 *
 * En lisant le cache, l'affichage est immédiat au deuxième lancement, et les
 * lignes apparaissent réseau par réseau au fur et à mesure des réponses.
 */
export function aggregateHistory(
  cache: Record<string, TxSummary[]>,
  chains: readonly HistoryChain[],
  addressFor: (chain: HistoryChain) => string | undefined,
): TxSummary[] {
  const seen = new Map<string, TxSummary>();
  for (const c of chains) {
    const address = addressFor(c);
    if (!address) continue;
    /*
     * Clé RÉSEAU + EMPREINTE : l'empreinte seule confond deux transactions
     * homonymes venues de deux chaînes EVM, ce qui arrive réellement.
     */
    for (const tx of cache[cacheKey(c.id, address)] ?? []) seen.set(`${tx.chain}:${tx.hash}`, tx);
  }
  return [...seen.values()].sort((a, b) => b.timestamp - a.timestamp);
}

/**
 * Un chargement est-il en cours pour l'un de ces réseaux ? Réactif.
 *
 * Rend un BOOLÉEN, et c'est volontaire : un sélecteur zustand qui rendrait un
 * objet neuf à chaque appel serait comparé par identité et redéclencherait un
 * rendu en boucle.
 */
export function useAnyHistoryLoading(
  chains: readonly HistoryChain[],
  addressFor: (chain: HistoryChain) => string | undefined,
): boolean {
  return useHistoryStore((s) =>
    chains.some((c) => {
      const address = addressFor(c);
      return address ? s.loading[cacheKey(c.id, address)] === true : false;
    }),
  );
}

/**
 * Au moins un réseau a-t-il déjà répondu avec succès ?
 *
 * Sépare « rien à montrer » de « on n'a pas réussi à demander ». Sans cette
 * distinction, un réseau injoignable produirait le message « aucune activité »,
 * qui affirme quelque chose de faux sur le portefeuille de l'utilisateur.
 */
export function useAnyHistoryFetched(
  chains: readonly HistoryChain[],
  addressFor: (chain: HistoryChain) => string | undefined,
): boolean {
  return useHistoryStore((s) =>
    chains.some((c) => {
      const address = addressFor(c);
      return address ? (s.lastFetch[cacheKey(c.id, address)] ?? 0) > 0 : false;
    }),
  );
}
