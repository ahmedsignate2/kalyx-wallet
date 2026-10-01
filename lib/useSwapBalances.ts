/**
 * SOLDES DU SWAP — un seul endroit, une seule règle par problème.
 *
 *  - Registre clé → état (lib/swapBalance) : une réponse ne peut atterrir que
 *    sur SA clé (réseau + compte + jeton). Un échec est « erreur », jamais 0.
 *  - Une lecture par clé à la fois : la relecture périodique et la
 *    pré-vérification partagent la même promesse.
 *  - Un solde connu reste affiché pendant sa relecture, et si elle échoue.
 *  - ÉCHANGE EN COURS : entre la diffusion et l'issue (confirmé, échoué,
 *    expiré — ou 3 min au plus), le nœud peut encore rendre les soldes d'AVANT.
 *    Tout le périmètre (réseau + compte, jeton reçu compris) est vidé et rien
 *    n'y est écrit ; à l'issue, il est vidé de nouveau puis relu. Toute lecture
 *    partie avant une de ces bascules est ignorée (génération).
 */
import { useEffect, useRef, useState } from 'react';
import { needsRead, readSwapBalance, swapBalanceKey, type BalanceEntry } from './swapBalance';

/** Au-delà, un échange sans issue connue libère les soldes (relus tels que le réseau les donne). */
export const SWAP_PENDING_MAX_MS = 180_000;
/** Sondage de la relecture périodique : un solde a au plus ~40 s (30 s de fraîcheur + un sondage). */
const POLL_MS = 10_000;

const scopeOf = (chainId: string, owner: string | undefined) => swapBalanceKey(chainId, owner, '');

export function useSwapBalances(opts: {
  chainId: string;
  owner: string | undefined;
  /** Adresse du jeton source ; null tant qu'aucun n'est choisi. */
  srcToken: string | null;
  srcNative: boolean;
  /** Relecture périodique suspendue (confirmation en cours). */
  pausedRef: { current: boolean };
}) {
  const { chainId, owner, srcToken, srcNative, pausedRef } = opts;
  const [balances, setBalances] = useState<Record<string, BalanceEntry>>({});
  const [pending, setPending] = useState<Record<string, number>>({});
  const pendingRef = useRef(pending);
  pendingRef.current = pending;
  const gen = useRef(0);
  const inflight = useRef(new Map<string, Promise<bigint>>());
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());
  useEffect(() => {
    const set = timers.current;
    return () => set.forEach(clearTimeout);
  }, []);

  const scope = scopeOf(chainId, owner);
  const swapPending = (pending[scope] ?? 0) > 0;
  const srcKey = srcToken ? swapBalanceKey(chainId, owner, srcNative ? 'native' : srcToken) : '';
  /** Le natif paie aussi le gas d'un échange de jeton. */
  const gasKey = swapBalanceKey(chainId, owner, 'native');

  const isPending = (sc: string) => (pendingRef.current[sc] ?? 0) > 0;
  const purge = (sc: string) => setBalances((b) => Object.fromEntries(Object.entries(b).filter(([k]) => !k.startsWith(sc))));

  /** Lecture partagée d'un solde du périmètre COURANT ; lève si elle échoue (ou si un échange est en cours). */
  const read = (key: string, token: string, native: boolean): Promise<bigint> => {
    if (!owner) return Promise.reject(new Error('Aucun compte'));
    if (isPending(scope)) return Promise.reject(new Error('Échange en cours'));
    const running = inflight.current.get(key);
    if (running) return running;
    const g = gen.current;
    const current = () => g === gen.current && !isPending(scope);
    setBalances((b) => (b[key]?.status === 'ok' ? b : { ...b, [key]: { status: 'loading', since: Date.now() } }));
    const p = readSwapBalance(chainId, owner, token, native).then(
      (raw) => {
        if (current()) setBalances((b) => ({ ...b, [key]: { status: 'ok', raw, at: Date.now() } }));
        return raw;
      },
      (e) => {
        if (current()) setBalances((b) => (b[key]?.status === 'ok' ? b : { ...b, [key]: { status: 'error' } }));
        throw e;
      },
    );
    inflight.current.set(key, p);
    void p.catch(() => {}).finally(() => inflight.current.delete(key));
    return p;
  };
  const load = (key: string, token: string, native: boolean) => void read(key, token, native).catch(() => {});

  /** Relit ce qui manque, a échoué ou a vieilli (dépensé ailleurs entre-temps). */
  const refreshRef = useRef<() => void>(() => {});
  refreshRef.current = () => {
    if (!owner || !srcToken || isPending(scope)) return;
    const now = Date.now();
    if (needsRead(balances[srcKey], now)) load(srcKey, srcToken, srcNative);
    if (!srcNative && needsRead(balances[gasKey], now)) load(gasKey, 'native', true);
  };
  useEffect(() => {
    refreshRef.current();
  }, [srcKey, gasKey, swapPending]);
  useEffect(() => {
    const id = setInterval(() => {
      if (!pausedRef.current) refreshRef.current();
    }, POLL_MS);
    return () => clearInterval(id);
  }, [pausedRef]);

  const srcEntry = srcKey ? balances[srcKey] : undefined;
  const gasEntry = balances[srcNative ? srcKey : gasKey];

  return {
    srcEntry,
    gasEntry,
    swapPending,
    /** Relance une lecture en échec ou absente (sans effet si elle est déjà en vol). */
    retry: () => {
      if (srcToken && srcEntry?.status !== 'ok') load(srcKey, srcToken, srcNative);
    },
    /** Solde source (ou natif) frais pour la pré-vérification : relu s'il est trop vieux. */
    readSrc: () => (srcToken ? read(srcKey, srcToken, srcNative) : Promise.reject(new Error('Aucun jeton'))),
    readGas: () => read(gasKey, 'native', true),
    /**
     * Soldes déjà connus par la liste des jetons détenus (indexeur, parfois en
     * retard) : affichés tout de suite mais tenus pour VIEUX (`at: 0`) — une
     * lecture directe suit, et la pré-vérification ne s'y fie pas. N'écrase
     * qu'un vide ou un échec, jamais une lecture directe.
     */
    seedHeld: (forChain: string, forOwner: string, list: { token: string; raw: bigint }[]) => {
      const sc = scopeOf(forChain, forOwner);
      if (isPending(sc)) return;
      const g = gen.current;
      setBalances((b) => {
        if (g !== gen.current) return b;
        const next = { ...b };
        for (const { token, raw } of list) {
          const key = swapBalanceKey(forChain, forOwner, token);
          if (!next[key] || next[key].status === 'error') next[key] = { status: 'ok', raw, at: 0 };
        }
        return next;
      });
    },
    /**
     * Échange diffusé : renvoie `settle`, à appeler à son issue connue
     * (confirmé, échoué, expiré). Sans issue, les soldes sont libérés au bout de
     * 3 min. Plusieurs échanges en cours : libérés quand le DERNIER aboutit.
     */
    beginSwap: (): (() => void) => {
      const sc = scope;
      gen.current += 1;
      pendingRef.current = { ...pendingRef.current, [sc]: (pendingRef.current[sc] ?? 0) + 1 };
      setPending(pendingRef.current);
      purge(sc);
      let done = false;
      const settle = () => {
        if (done) return;
        done = true;
        timers.current.delete(timer);
        clearTimeout(timer);
        gen.current += 1;
        pendingRef.current = { ...pendingRef.current, [sc]: Math.max(0, (pendingRef.current[sc] ?? 0) - 1) };
        setPending(pendingRef.current);
        purge(sc);
      };
      const timer = setTimeout(settle, SWAP_PENDING_MAX_MS);
      timers.current.add(timer);
      return settle;
    },
  };
}
