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
 *    Cet état vit au niveau du MODULE : quitter l'écran et revenir ne le perd pas.
 */
import { useEffect, useRef, useState } from 'react';
import { create } from 'zustand';
import { needsRead, readSwapBalance, swapBalanceKey, type BalanceEntry } from './swapBalance';

/** Au-delà, un échange sans issue connue libère les soldes (relus tels que le réseau les donne). */
export const SWAP_PENDING_MAX_MS = 180_000;
/** Issue inconnue (suivi expiré ou illisible) : courte attente avant de relire. */
export const SWAP_UNKNOWN_GRACE_MS = 15_000;

const scopeOf = (chainId: string, owner: string | undefined) => swapBalanceKey(chainId, owner, '');

/** Échanges en cours par périmètre (réseau + compte) et génération — partagés entre montages. */
const usePendingSwaps = create<{ pending: Record<string, number>; gen: number }>(() => ({ pending: {}, gen: 0 }));
/** Un échange est-il en cours sur ce réseau pour ce compte ? */
export const isSwapPending = (chainId: string, owner: string | undefined) => pendingOf(scopeOf(chainId, owner));
const pendingOf = (scope: string) => (usePendingSwaps.getState().pending[scope] ?? 0) > 0;
const bump = (scope: string, delta: number) =>
  usePendingSwaps.setState((st) => ({ gen: st.gen + 1, pending: { ...st.pending, [scope]: Math.max(0, (st.pending[scope] ?? 0) + delta) } }));

/**
 * Échange diffusé sur `chainId` par `owner` : renvoie `settle(final)`.
 * `final` vrai (confirmé, échoué, expiré) → soldes relus tout de suite ; faux
 * (suivi sans issue) → relus après une courte attente. Sans appel : 3 min.
 */
export function beginSwap(chainId: string, owner: string | undefined): (final: boolean) => void {
  const scope = scopeOf(chainId, owner);
  bump(scope, +1);
  let done = false;
  const release = () => {
    if (done) return;
    done = true;
    clearTimeout(cap);
    bump(scope, -1);
  };
  const cap = setTimeout(release, SWAP_PENDING_MAX_MS);
  return (final) => {
    if (final) release();
    else setTimeout(release, SWAP_UNKNOWN_GRACE_MS);
  };
}
/** Sondage de la relecture périodique : un solde a au plus ~40 s (30 s de fraîcheur + un sondage). */
const POLL_MS = 10_000;


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
  /** Lectures en vol, avec la génération qui les a lancées (une lecture d'avant un échange n'est jamais resservie). */
  const inflight = useRef(new Map<string, { g: number; p: Promise<bigint> }>());

  const scope = scopeOf(chainId, owner);
  const swapPending = usePendingSwaps((st) => (st.pending[scope] ?? 0) > 0);
  const gen = usePendingSwaps((st) => st.gen);
  /*
   * À chaque bascule (échange diffusé ou abouti), les soldes du périmètre sont
   * vidés : ceux d'avant ne doivent ni s'afficher ni servir à un calcul.
   */
  const lastGen = useRef(gen);
  useEffect(() => {
    if (lastGen.current === gen) return;
    lastGen.current = gen;
    setBalances((b) => Object.fromEntries(Object.entries(b).filter(([k]) => !k.startsWith(scope))));
  }, [gen, scope]);
  const srcKey = srcToken ? swapBalanceKey(chainId, owner, srcNative ? 'native' : srcToken) : '';
  /** Le natif paie aussi le gas d'un échange de jeton. */
  const gasKey = swapBalanceKey(chainId, owner, 'native');


  /** Lecture partagée d'un solde du périmètre COURANT ; lève si elle échoue (ou si un échange est en cours). */
  const read = (key: string, token: string, native: boolean): Promise<bigint> => {
    if (!owner) return Promise.reject(new Error('Aucun compte'));
    if (pendingOf(scope)) return Promise.reject(new Error('Échange en cours'));
    const g = usePendingSwaps.getState().gen;
    const running = inflight.current.get(key);
    if (running && running.g === g) return running.p;
    const current = () => g === usePendingSwaps.getState().gen && !pendingOf(scope);
    setBalances((b) => (b[key]?.status === 'ok' ? b : { ...b, [key]: { status: 'loading', since: Date.now() } }));
    const p = readSwapBalance(chainId, owner, token, native).then(
      (raw) => {
        if (current()) setBalances((b) => ({ ...b, [key]: { status: 'ok', raw, at: Date.now() } }));
        return raw;
      },
      (e) => {
        // Un solde LU (at > 0) reste affiché si sa relecture échoue ; un solde d'indexeur, non.
        if (current()) setBalances((b) => (b[key]?.status === 'ok' && b[key].at > 0 ? b : { ...b, [key]: { status: 'error' } }));
        throw e;
      },
    );
    const entry = { g, p };
    inflight.current.set(key, entry);
    void p.catch(() => {}).finally(() => {
      if (inflight.current.get(key) === entry) inflight.current.delete(key);
    });
    return p;
  };
  const load = (key: string, token: string, native: boolean) => void read(key, token, native).catch(() => {});

  /** Relit ce qui manque, a échoué ou a vieilli (dépensé ailleurs entre-temps). */
  const refreshRef = useRef<() => void>(() => {});
  refreshRef.current = () => {
    if (!owner || !srcToken || pendingOf(scope)) return;
    const now = Date.now();
    if (needsRead(balances[srcKey], now)) load(srcKey, srcToken, srcNative);
    if (!srcNative && needsRead(balances[gasKey], now)) load(gasKey, 'native', true);
  };
  useEffect(() => {
    refreshRef.current();
  }, [srcKey, gasKey, swapPending, gen]);
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
    seedHeld: (forChain: string, forOwner: string, list: { token: string; raw: bigint }[], loadedAtGen: number) => {
      if (pendingOf(scopeOf(forChain, forOwner))) return;
      setBalances((b) => {
        if (loadedAtGen !== usePendingSwaps.getState().gen) return b; // liste lue avant un échange
        const next = { ...b };
        for (const { token, raw } of list) {
          const key = swapBalanceKey(forChain, forOwner, token);
          if (!next[key] || next[key].status === 'error') next[key] = { status: 'ok', raw, at: 0 };
        }
        return next;
      });
    },
    /** Génération courante : à relever AVANT de lancer la lecture de la liste des jetons détenus. */
    currentGen: () => usePendingSwaps.getState().gen,
  };
}
