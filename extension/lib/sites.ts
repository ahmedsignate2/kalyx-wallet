/**
 * SITES CONNECTÉS — ce que chaque origine a le droit de voir.
 *
 * L'origine est celle que CHROME donne pour l'expéditeur du message
 * (`port.sender.origin`), jamais celle que la page affirme. Une permission est
 * liée à UN compte (portefeuille + index) et à UNE famille (EVM, Solana) :
 * connecter Solana sur un site ne lui montre pas l'adresse EVM.
 *
 * Le réseau EVM est retenu PAR SITE : passer Uniswap sur Base ne change pas
 * le réseau d'Aave.
 */
import type { Store } from './storage';

export type Family = 'evm' | 'solana' | 'bitcoin';

export interface SiteGrant {
  walletId: string;
  index: number;
  address: string;
  at: number;
}

export interface Site {
  origin: string;
  evm?: SiteGrant;
  solana?: SiteGrant;
  bitcoin?: SiteGrant;
  /** Réseau EVM choisi par ce site (hexadécimal, EIP-155). */
  chainId: string;
}

const KEY = 'sites';
const MAX_SITES = 500;
export const DEFAULT_CHAIN = '0x1';

/** Origine web acceptée : https, ou http pour une machine locale (développement). */
export function webOrigin(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  const local = u.hostname === 'localhost' || u.hostname === '127.0.0.1' || u.hostname === '[::1]';
  if (u.protocol !== 'https:' && !(u.protocol === 'http:' && local)) return null;
  return u.origin;
}

export function makeSites(disk: Store) {
  const all = async (): Promise<Record<string, Site>> => (await disk.get<Record<string, Site>>(KEY)) ?? {};

  let queue: Promise<unknown> = Promise.resolve();
  /** Écritures en file : deux connexions simultanées ne s'écrasent pas. */
  const update = <T>(fn: (sites: Record<string, Site>) => T): Promise<T> => {
    const run = queue.then(async () => {
      const sites = await all();
      const out = fn(sites);
      // Les plus anciens sans permission partent d'abord quand la liste déborde.
      const keys = Object.keys(sites);
      if (keys.length > MAX_SITES) {
        for (const k of keys.filter((k) => !sites[k].evm && !sites[k].solana && !sites[k].bitcoin).slice(0, keys.length - MAX_SITES)) delete sites[k];
      }
      await disk.set(KEY, sites);
      return out;
    });
    queue = run.catch(() => {});
    return run;
  };

  return {
    get: async (origin: string): Promise<Site> => (await all())[origin] ?? { origin, chainId: DEFAULT_CHAIN },
    list: async (): Promise<Site[]> => Object.values(await all()).filter((s) => s.evm || s.solana || s.bitcoin),
    grant: (origin: string, family: Family, g: SiteGrant) =>
      update((sites) => {
        sites[origin] = { ...(sites[origin] ?? { origin, chainId: DEFAULT_CHAIN }), [family]: g };
        return sites[origin];
      }),
    revoke: (origin: string, family?: Family) =>
      update((sites) => {
        const s = sites[origin];
        if (!s) return;
        if (family) delete s[family];
        else {
          delete s.evm;
          delete s.solana;
          delete s.bitcoin;
        }
      }),
    setChain: (origin: string, chainId: string) =>
      update((sites) => {
        sites[origin] = { ...(sites[origin] ?? { origin, chainId: DEFAULT_CHAIN }), chainId };
      }),
    /** Un portefeuille supprimé ou un compte retiré : ses permissions partent avec lui. */
    forgetWallet: (walletId: string) =>
      update((sites) => {
        for (const s of Object.values(sites)) {
          if (s.evm?.walletId === walletId) delete s.evm;
          if (s.solana?.walletId === walletId) delete s.solana;
          if (s.bitcoin?.walletId === walletId) delete s.bitcoin;
        }
      }),
  };
}

export type Sites = ReturnType<typeof makeSites>;
