/**
 * SUIVI DES TRANSACTIONS envoyées depuis l'extension, jusqu'à leur issue —
 * même popup fermé, même service worker endormi entre deux vérifications.
 *
 * La liste vit dans la zone session (effacée à la fermeture du navigateur) ;
 * une alarme la relit toutes les 30 s. À l'issue : UNE notification
 * (confirmée ou échouée), rien pendant l'attente — pas de notification inutile.
 * Au-delà d'une heure sans issue, le suivi s'arrête sans bruit.
 */
import type { Store } from './storage';

export interface Watched {
  txid: string;
  chainId: string;
  chainName: string;
  /** Ce qui est parti (« 0.1 ETH »), ou la nature de l'opération. */
  what: string;
  explorer?: string;
  opaque?: unknown;
  expiresAt?: number;
  at: number;
}

export type TxOutcome = 'pending' | 'confirmed' | 'failed';

const KEY = 'txWatch';
const MAX = 30;
const GIVE_UP_MS = 60 * 60_000;

export function makeTxWatch(deps: {
  store: Store;
  check: (w: Watched) => Promise<TxOutcome>;
  notify: (outcome: 'confirmed' | 'failed', w: Watched) => void;
  /** Démarre ou arrête l'alarme selon qu'il reste quelque chose à suivre. */
  schedule: (active: boolean) => void;
  now?: () => number;
}) {
  const now = deps.now ?? Date.now;
  const read = async () => (await deps.store.get<Watched[]>(KEY)) ?? [];
  let queue: Promise<unknown> = Promise.resolve();
  const serial = <T>(fn: () => Promise<T>): Promise<T> => {
    const run = queue.then(fn, fn);
    queue = run.catch(() => {});
    return run;
  };

  function add(w: Omit<Watched, 'at'>): Promise<void> {
    return serial(async () => {
      const list = (await read()).filter((x) => x.txid !== w.txid);
      list.push({ ...w, at: now() });
      await deps.store.set(KEY, list.slice(-MAX));
      deps.schedule(true);
    });
  }

  /** Une passe : chaque transaction est relue ; issue connue → notification, et elle sort de la liste. */
  function tick(): Promise<void> {
    return serial(async () => {
      const keep: Watched[] = [];
      for (const w of await read()) {
        if (now() - w.at > GIVE_UP_MS) continue;
        const r = await deps.check(w).catch((): TxOutcome => 'pending');
        if (r === 'pending') keep.push(w);
        else deps.notify(r, w);
      }
      await deps.store.set(KEY, keep);
      deps.schedule(keep.length > 0);
    });
  }

  const explorerOf = async (txid: string) => (await read()).find((w) => w.txid === txid)?.explorer;

  return { add, tick, explorerOf, pending: async () => (await read()).length };
}

export type TxWatch = ReturnType<typeof makeTxWatch>;
