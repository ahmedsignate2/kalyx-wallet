/**
 * RAPPELS D'AUTORISATIONS : chaque autorisation de token accordée à un site
 * par Kalyx est notée avec une échéance choisie dans la fenêtre (1 h, 24 h,
 * 7 jours, ou jamais). Une autorisation ERC-20 n'expire pas d'elle-même :
 * à l'échéance, Kalyx prévient (notification) et propose de toutes les
 * révoquer en un clic. Révoquer reste une transaction que tu signes : rien ne
 * part sans toi.
 */
import type { Store } from './storage';

export interface Grant {
  id: string;
  chainId: string;
  chainName: string;
  token: string;
  symbol: string;
  spender: string;
  origin: string;
  at: number;
  expiresAt: number;
  notified?: boolean;
}

export const REMIND_HOURS = [0, 1, 24, 168] as const;
const MAX = 100;
const same = (g: Grant, chainId: string, token: string, spender: string) => g.chainId === chainId && g.token.toLowerCase() === token.toLowerCase() && g.spender.toLowerCase() === spender.toLowerCase();

export function makeGrants(deps: { disk: Store; now?: () => number }) {
  const now = deps.now ?? Date.now;
  const list = async (): Promise<Grant[]> => (await deps.disk.get<Grant[]>('grants')) ?? [];
  const save = (l: Grant[]) => deps.disk.set('grants', l);

  return {
    list,
    async add(g: Omit<Grant, 'id' | 'notified'>): Promise<void> {
      // Une même autorisation (réseau, token, contrat) n'a qu'un rappel : le plus récent.
      const rest = (await list()).filter((x) => !same(x, g.chainId, g.token, g.spender));
      const id = `${g.chainId}:${g.token.toLowerCase()}:${g.spender.toLowerCase()}`;
      await save([...rest, { ...g, id }].slice(-MAX));
    },
    async remove(chainId: string, token: string, spender: string): Promise<void> {
      await save((await list()).filter((x) => !same(x, chainId, token, spender)));
    },
    async dismiss(id: unknown): Promise<void> {
      await save((await list()).filter((x) => x.id !== id));
    },
    expired: async () => (await list()).filter((g) => g.expiresAt <= now()),
    /** Échues et pas encore signalées : à notifier, puis marquées. */
    async takeDue(): Promise<Grant[]> {
      const all = await list();
      const due = all.filter((g) => g.expiresAt <= now() && !g.notified);
      if (due.length) await save(all.map((g) => (due.includes(g) ? { ...g, notified: true } : g)));
      return due;
    },
  };
}

export type Grants = ReturnType<typeof makeGrants>;
