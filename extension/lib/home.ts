/**
 * ÉCRAN PRINCIPAL (popup et panneau latéral) : quel compte est affiché, dans
 * quelle devise, et ses soldes et son activité.
 *
 * Tout passe par la session : verrouillée, l'extension ne montre ni soldes ni
 * activité (quelqu'un devant un ordinateur partagé ne voit rien).
 */
import { SessionError, type Session } from './session';
import type { Store } from './storage';
import type { WalletMeta, Wallets } from './wallets';
import type { Acct, Portfolio } from './portfolio';

export const FIATS = ['eur', 'usd', 'gbp', 'chf', 'jpy', 'cad', 'aud'] as const;
export type Fiat = (typeof FIATS)[number];

export interface Selection {
  walletId: string;
  index: number;
}

const K = { selected: 'selected', fiat: 'fiat' } as const;

export function makeHome(disk: Store, session: Session, wallets: Wallets, portfolio: Portfolio, defaultFiat: Fiat) {
  const fiat = async (): Promise<Fiat> => {
    const f = await disk.get<string>(K.fiat);
    return (FIATS as readonly string[]).includes(f ?? '') ? (f as Fiat) : defaultFiat;
  };

  /** Compte affiché : celui choisi s'il existe encore, sinon le premier compte du premier portefeuille. */
  async function current(list?: WalletMeta[]): Promise<{ wallet: WalletMeta; index: number; acct: Acct } | null> {
    const all = list ?? (await wallets.list());
    const sel = await disk.get<Selection>(K.selected);
    const wallet = all.find((w) => w.id === sel?.walletId) ?? all[0];
    if (!wallet) return null;
    const account = wallet.accounts.find((a) => a.index === sel?.index) ?? wallet.accounts[0];
    if (!account) return null;
    return { wallet, index: account.index, acct: { evm: account.evm, solana: account.solana, bitcoin: account.bitcoin } };
  }

  const needUnlocked = async () => {
    if (!(await session.status()).unlocked) throw new SessionError('LOCKED');
  };

  /** Tout ce qu'il faut pour dessiner l'écran d'un coup, sans réseau (< 200 ms). */
  async function get() {
    const st = await session.status();
    if (!st.hasVault || !st.unlocked) return { status: st };
    // Portefeuilles d'avant Bitcoin : leur adresse bc1 est ajoutée une fois, coffre ouvert.
    await wallets.backfillBitcoin().catch(() => false);
    const list = await wallets.list();
    const cur = await current(list);
    const f = await fiat();
    return {
      status: st,
      wallets: list,
      selected: cur ? { walletId: cur.wallet.id, index: cur.index } : null,
      fiat: f,
      portfolio: cur ? await portfolio.cached(cur.acct, f) : null,
    };
  }

  async function select(walletId: string, index: number) {
    await needUnlocked();
    const w = (await wallets.list()).find((x) => x.id === walletId);
    if (!w || !w.accounts.some((a) => a.index === index)) throw new SessionError('UNKNOWN_ACCOUNT');
    await disk.set<Selection>(K.selected, { walletId, index });
  }

  async function setFiat(f: unknown) {
    if (typeof f !== 'string' || !(FIATS as readonly string[]).includes(f)) throw new SessionError('BAD_SETTING');
    await disk.set(K.fiat, f);
  }

  async function refresh() {
    await needUnlocked();
    const cur = await current();
    if (!cur) throw new SessionError('UNKNOWN_ACCOUNT');
    return portfolio.refresh(cur.acct, await fiat());
  }

  async function activity(fresh: boolean) {
    await needUnlocked();
    const cur = await current();
    if (!cur) throw new SessionError('UNKNOWN_ACCOUNT');
    const f = await fiat();
    return fresh ? portfolio.refreshActivity(cur.acct, f) : portfolio.cachedActivity(cur.acct, f);
  }

  return { get, select, setFiat, refresh, activity, current, fiat };
}

export type Home = ReturnType<typeof makeHome>;
