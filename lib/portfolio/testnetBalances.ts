/**
 * Soldes des RÉSEAUX DE TEST (Sepolia, Base Sepolia, Monad Testnet, Solana
 * Devnet, TON Testnet).
 *
 * Ils ne valent rien et n'entrent jamais dans le total : on les lit à part, et
 * seulement quand l'utilisateur affiche les réseaux de test. Sans cela, le seul
 * moyen de connaître son solde de test était d'ouvrir l'écran Envoyer.
 *
 * Partagé par l'app (accueil) et le tableau de bord web : même lecture, mêmes
 * règles — un solde nul n'est pas listé, un réseau muet garde sa dernière
 * valeur plutôt qu'un zéro inventé.
 */
import { create } from 'zustand';
import { getAdapter, listChains, formatAmount, type ChainConfig } from '../../src';
import { addressForChain } from '../accountAddress';
import type { Holding, PortfolioAccount } from './portfolioStore';

export interface TestnetBalance {
  chain: ChainConfig;
  address: string;
  raw: bigint;
  amount: number;
}

interface TestnetState {
  /** Clé du compte lu (adresses) : un autre compte ne montre jamais ces soldes. */
  key: string | null;
  balances: TestnetBalance[];
  loading: boolean;
  /** Réseaux qui n'ont pas répondu au dernier passage. */
  failed: string[];
  at: number;
  refresh: (acct: PortfolioAccount, opts?: { force?: boolean }) => Promise<void>;
}

const STALE_MS = 30_000;

export const testnetKey = (a: PortfolioAccount) =>
  [a.evmAddress?.toLowerCase() ?? '', a.solAddress ?? '', a.btcAddress?.toLowerCase() ?? '', a.tonPublicKey?.toLowerCase() ?? ''].join('|');

/** Les réseaux de test que ce compte peut lire (une adresse pour la famille). */
export function testnetChains(acct: PortfolioAccount): ChainConfig[] {
  return listChains({ includeTestnets: true }).filter((c) => c.testnet && !!addressForChain(acct, c));
}

let gen = 0;

export const useTestnetBalances = create<TestnetState>((set, get) => ({
  key: null,
  balances: [],
  loading: false,
  failed: [],
  at: 0,
  refresh: async (acct, opts) => {
    const key = testnetKey(acct);
    const s = get();
    if (!opts?.force && s.key === key && Date.now() - s.at < STALE_MS) return;
    const my = ++gen;
    // Autre compte : on vide d'abord, jamais les soldes du précédent sous un autre nom.
    set(s.key === key ? { loading: true } : { key, balances: [], failed: [], loading: true });
    const previous = s.key === key ? s.balances : [];
    const failed: string[] = [];
    const rows = await Promise.all(
      testnetChains(acct).map(async (chain): Promise<TestnetBalance | null> => {
        const address = addressForChain(acct, chain);
        try {
          const raw = (await getAdapter(chain.id).getBalance(address)).raw;
          if (raw === 0n) return null;
          return { chain, address, raw, amount: Number(formatAmount(raw, chain.nativeDecimals)) };
        } catch {
          failed.push(chain.id);
          // Réseau muet : la dernière valeur connue plutôt qu'un zéro inventé.
          return previous.find((b) => b.chain.id === chain.id) ?? null;
        }
      }),
    );
    if (my !== gen) return; // un passage plus récent a déjà répondu
    set({ key, balances: rows.filter((r): r is TestnetBalance => r !== null), failed, loading: false, at: Date.now() });
  },
}));

/**
 * Les soldes de test sous la forme d'un actif du portefeuille : l'écran Envoyer
 * les liste à côté des vrais, SANS que le portefeuille agrégé (total, courbe,
 * accueil) ne les charge — ils n'y entrent jamais.
 */
export function testnetHoldings(balances: TestnetBalance[]): Holding[] {
  return balances.map((b) => ({
    id: `${b.chain.id}:native`,
    chainId: b.chain.id,
    kind: 'native' as const,
    symbol: b.chain.nativeSymbol,
    name: b.chain.nativeSymbol,
    decimals: b.chain.nativeDecimals,
    raw: b.raw,
    amount: b.amount,
    price: 0,
    fiat: 0,
    change24h: null,
    verified: true,
  }));
}
