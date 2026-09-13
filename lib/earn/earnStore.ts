/**
 * Store Earn (Zustand) — état PARTAGÉ entre l'écran Earn, les onglets
 * Staking/DeFi du portefeuille et l'accueil : APY, soldes, positions, prix.
 *
 * Une seule source de vérité, rafraîchie après chaque transaction.
 */
import { create } from 'zustand';
import { EARN_CATALOG, getPrices, formatAmount, type EarnProtocol, type EarnPosition } from '../../src';
import { loadAll, loadApys, type EarnAccount, type EarnBalances } from './earnEngine';

/** Position enrichie pour l'affichage. */
export interface EarnPositionView {
  protocol: EarnProtocol;
  balance: bigint;
  /** Montant lisible (6 décimales max). */
  amount: number;
  /** Valeur en devise (0 si prix inconnu). */
  fiat: number;
  apy: number | null;
  /** Gain annuel estimé en devise. */
  yearlyFiat: number;
}

interface EarnState {
  apys: Record<string, number | null>;
  balances: EarnBalances;
  positions: EarnPosition[];
  /** coingeckoId → prix dans la devise de l'app. */
  prices: Record<string, number>;
  pricesFiat: string;
  loading: boolean;
  /** Clé du compte pour lequel les données ont été chargées. */
  loadedFor: string | null;
  lastLoadedAt: number;
  error: string | null;

  refresh: (acct: EarnAccount, fiat: string, opts?: { force?: boolean }) => Promise<void>;
  /** Rafraîchit uniquement soldes + positions (après une tx). */
  refreshBalances: (acct: EarnAccount) => Promise<void>;
}

const STALE_MS = 60_000;

const accountKey = (a: EarnAccount) => `${a.evmAddress}|${a.solAddress ?? ''}`;

export const useEarn = create<EarnState>((set, get) => ({
  apys: {},
  balances: { underlying: {}, gas: {} },
  positions: [],
  prices: {},
  pricesFiat: '',
  loading: false,
  loadedFor: null,
  lastLoadedAt: 0,
  error: null,

  refresh: async (acct, fiat, opts) => {
    const key = accountKey(acct);
    const s = get();
    const fresh = s.loadedFor === key && s.pricesFiat === fiat && Date.now() - s.lastLoadedAt < STALE_MS;
    if (fresh && !opts?.force) return;
    if (s.loading) return;
    set({ loading: true, error: null });
    try {
      const ids = [...new Set(EARN_CATALOG.flatMap((p) => [p.underlying.coingeckoId, p.receipt.coingeckoId]).filter((x): x is string => !!x))];
      const [all, apys, priceMap] = await Promise.all([
        loadAll(acct),
        s.loadedFor === key && Object.keys(s.apys).length ? Promise.resolve(s.apys) : loadApys(),
        getPrices(ids, fiat).catch(() => ({} as Record<string, { price: number }>)),
      ]);
      const prices: Record<string, number> = {};
      for (const [id, v] of Object.entries(priceMap)) prices[id] = v.price;
      set({
        balances: all.balances,
        positions: all.positions,
        apys,
        prices: Object.keys(prices).length ? prices : s.prices,
        pricesFiat: fiat,
        loadedFor: key,
        lastLoadedAt: Date.now(),
        loading: false,
      });
    } catch (e) {
      set({ loading: false, error: e instanceof Error ? e.message : 'Chargement impossible' });
    }
  },

  refreshBalances: async (acct) => {
    try {
      const all = await loadAll(acct);
      set({ balances: all.balances, positions: all.positions, lastLoadedAt: Date.now() });
    } catch {
      /* best-effort */
    }
  },
}));

/** Nombre fini ou 0 — jamais de NaN/Infinity dans une somme affichée. */
export function safeNum(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** Prix d'un token Earn dans la devise de l'app (0 si inconnu). */
export function priceOf(prices: Record<string, number>, coingeckoId?: string): number {
  return coingeckoId ? safeNum(prices[coingeckoId]) : 0;
}

/** Totaux d'une liste de positions (toujours des nombres finis). */
export function sumPositions(list: EarnPositionView[]): { total: number; yearly: number } {
  return list.reduce(
    (acc, p) => ({ total: acc.total + safeNum(p.fiat), yearly: acc.yearly + safeNum(p.yearlyFiat) }),
    { total: 0, yearly: 0 },
  );
}

/** Vues des positions (triées par valeur décroissante). */
export function selectPositions(s: Pick<EarnState, 'positions' | 'prices' | 'apys'>): EarnPositionView[] {
  const out: EarnPositionView[] = [];
  for (const pos of s.positions) {
    const protocol = EARN_CATALOG.find((p) => p.id === pos.protocolId);
    if (!protocol) continue;
    // Montant NUMÉRIQUE depuis le bigint (formatBalance renvoie « <0.000001 »
    // pour une poussière → Number() = NaN, qui contaminait tout le total).
    const amount = safeNum(Number(formatAmount(pos.balance, pos.decimals)));
    const price = safeNum(priceOf(s.prices, protocol.receipt.coingeckoId));
    const fiat = safeNum(amount * price);
    const apyRaw = s.apys[protocol.id];
    const apy = typeof apyRaw === 'number' && Number.isFinite(apyRaw) ? apyRaw : null;
    out.push({ protocol, balance: pos.balance, amount, fiat, apy, yearlyFiat: apy ? safeNum(fiat * (apy / 100)) : 0 });
  }
  return out.sort((a, b) => b.fiat - a.fiat);
}
