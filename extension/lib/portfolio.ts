/**
 * PORTEFEUILLE de l'extension : soldes, tokens, prix et activité du compte
 * affiché, sur tous les réseaux EVM et Solana à la fois (pas de « réseau
 * actif » à choisir).
 *
 * Le calcul est CELUI DE L'APP (lib/portfolio/holdings, lib/historyTrust,
 * src/domain/tx) : mêmes réseaux, mêmes prix, même tri anti-spam. Ce module
 * n'ajoute que le cache et la mise en forme pour l'interface.
 *
 * Vitesse : le dernier cliché est gardé sur le disque (rien de secret : des
 * soldes publics) et rendu tout de suite ; le réseau est relu ensuite.
 *
 * Réseau muet : il est NOMMÉ, jamais affiché à zéro. Ses actifs du cliché
 * précédent restent (carryOver), et si rien n'a pu être lu du tout, le total
 * est inconnu (null), pas 0.
 */
import { carryOver, deserialize, loadHoldings, serialize, splitHoldings, summarize, verifiedChainSymbols, verifiedContracts, type Holding, type Snapshot } from '../../lib/portfolio/holdings';
import { buildTrusted, pickHistoryChains } from '../../lib/historyTrust';
import { getAdapter, listChains } from '../../src/domain/chains/registry';
import { chainIconUrl, embeddedChainLogo } from '../../src/domain/chains/icons';
import { formatTokenAmount } from '../../src/domain/validation/format';
import { humanizeTx, type ActivityTranslate, type HumanTx } from '../../src/domain/tx/humanize';
import { knownCounterparties, spamReason } from '../../src/domain/tx/spam';
import type { ChainConfig, TxSummary } from '../../src/domain/chains/types';
import type { Store } from './storage';

export interface Acct {
  evm?: string;
  solana?: string;
}

/** Familles servies par l'extension en v1. */
const FAMILIES = new Set(['evm', 'solana']);
const STALE_MS = 45_000;
const MAX_ACTIVITY = 60;

export interface HoldingView {
  id: string;
  chainId: string;
  chainName: string;
  chainLogo?: string;
  symbol: string;
  name: string;
  amount: string;
  fiat: number;
  price: number;
  change24h: number | null;
  logo?: string;
  verified: boolean;
}

export interface PortfolioView {
  /** Moment de la lecture (0 = jamais lu). */
  at: number;
  fiat: string;
  /** null = inconnu (aucun réseau n'a répondu), jamais un faux 0. */
  total: number | null;
  pnl24h: number | null;
  pnl24hPct: number | null;
  main: HoldingView[];
  small: HoldingView[];
  hidden: HoldingView[];
  /** Réseaux qui n'ont pas répondu à la dernière lecture (noms lisibles). */
  failed: string[];
  /** Les listes de tokens ERC-20 ne sont pas encore servies (pas de clé d'indexeur dans l'extension). */
  erc20Unavailable: boolean;
}

export interface ActivityRow {
  hash: string;
  chainId: string;
  chainName: string;
  chainLogo?: string;
  timestamp: number;
  title: string;
  label: string;
  subtitle?: string;
  amount?: string;
  fiat?: string;
  tone: HumanTx['tone'];
  failed: boolean;
  pending: boolean;
  explorer?: string;
}

export interface ActivityView {
  at: number;
  rows: ActivityRow[];
  /** Lignes masquées (spam probable : sosie d'adresse, token inconnu, montant nul). */
  hiddenCount: number;
  failed: string[];
}

export interface PortfolioDeps {
  disk: Store;
  t: ActivityTranslate;
  locale?: string;
  now?: () => number;
  /** Injectables pour les tests (sinon : le calcul de l'app, sur le réseau). */
  load?: typeof loadHoldings;
  history?: (chainId: string, address: string) => Promise<TxSummary[]>;
}

const chainOf = (id: string): ChainConfig | undefined => {
  try {
    return getAdapter(id).config;
  } catch {
    return undefined;
  }
};
const chainName = (id: string) => chainOf(id)?.name ?? id;

/** Réseaux muets, les plus utilisés d'abord (le bandeau n'en nomme que quelques-uns). */
const PRIORITY = ['ethereum', 'solana', 'base', 'arbitrum', 'optimism', 'polygon', 'bnb', 'avalanche'];
const byPriority = (ids: string[]) => [...ids].sort((a, b) => (PRIORITY.indexOf(a) + 1 || 99) - (PRIORITY.indexOf(b) + 1 || 99));

/** Logo d'un réseau : le SVG embarqué de l'app en data URL, sinon l'image distante. */
export function chainLogo(id: string): string | undefined {
  const uri = chainIconUrl(id);
  const svg = embeddedChainLogo(uri);
  return svg ? `data:image/svg+xml,${encodeURIComponent(svg)}` : uri;
}

/** Seuls les logos https sont repris d'un indexeur (jamais javascript:, data: ou http:). */
const safeLogo = (u?: string) => (u && /^https:\/\//i.test(u) ? u : undefined);

/** Clé du cache : les adresses du compte (publiques) et la devise. */
const key = (kind: string, a: Acct, fiat = '') => `${kind}.${(a.evm ?? '').toLowerCase()}|${a.solana ?? ''}${fiat ? `.${fiat}` : ''}`;

/* bigint ↔ JSON : le disque ne sait pas stocker un bigint. */
const replacer = (_: string, v: unknown) => (typeof v === 'bigint' ? { __b: v.toString() } : v);
const reviver = (_: string, v: unknown) => (v && typeof v === 'object' && '__b' in v && typeof (v as { __b: unknown }).__b === 'string' ? BigInt((v as { __b: string }).__b) : v);

function view(h: Holding): HoldingView {
  return {
    id: h.id,
    chainId: h.chainId,
    chainName: chainName(h.chainId),
    chainLogo: chainLogo(h.chainId),
    symbol: h.symbol,
    name: h.name,
    amount: formatTokenAmount(h.raw, h.decimals),
    fiat: h.fiat,
    price: h.price,
    change24h: h.change24h,
    logo: safeLogo(h.logo),
    verified: h.verified,
  };
}

interface StoredSnapshot {
  json: string;
  failed: string[];
}

export function makePortfolio(deps: PortfolioDeps) {
  const now = deps.now ?? Date.now;
  const load = deps.load ?? loadHoldings;
  const history = deps.history ?? ((chainId: string, address: string) => getAdapter(chainId).getHistory(address));
  const inflight = new Map<string, Promise<unknown>>();
  const once = <T>(k: string, fn: () => Promise<T>): Promise<T> => {
    const running = inflight.get(k) as Promise<T> | undefined;
    if (running) return running;
    const p = fn().finally(() => inflight.delete(k));
    inflight.set(k, p);
    return p;
  };

  const erc20Unavailable = !listChains({ includeTestnets: false }).some((c) => c.family === 'evm' && c.rpcUrls.some((u) => u.includes('.alchemy.com')));

  async function readSnapshot(a: Acct, fiat: string): Promise<{ snap: Snapshot | null; failed: string[] }> {
    const s = await deps.disk.get<StoredSnapshot>(key('portfolio', a, fiat));
    return { snap: s ? deserialize(s.json) : null, failed: s?.failed ?? [] };
  }

  function toView(snap: Snapshot | null, failed: string[], fiat: string): PortfolioView {
    const holdings = snap?.holdings ?? [];
    const { main, small, hidden } = splitHoldings(holdings);
    const unknown = !snap || (holdings.length === 0 && failed.length > 0);
    return {
      at: snap?.at ?? 0,
      fiat,
      total: snap && !unknown ? snap.total : null,
      pnl24h: snap?.pnl24h ?? null,
      pnl24hPct: snap?.pnl24hPct ?? null,
      main: main.map(view),
      small: small.map(view),
      hidden: hidden.map(view),
      failed: byPriority(failed).map(chainName),
      erc20Unavailable,
    };
  }

  /** Dernier cliché (disque), sans réseau : c'est ce que le popup montre d'abord. */
  async function cached(a: Acct, fiat: string): Promise<PortfolioView & { stale: boolean }> {
    const { snap, failed } = await readSnapshot(a, fiat);
    return { ...toView(snap, failed, fiat), stale: !snap || now() - snap.at > STALE_MS };
  }

  /** Relit le réseau (une seule lecture à la fois par compte et devise). */
  function refresh(a: Acct, fiat: string): Promise<PortfolioView> {
    return once(key('portfolio', a, fiat), async () => {
      const { snap: before } = await readSnapshot(a, fiat);
      const failed = new Set<string>();
      const fresh = await load({ evmAddress: a.evm ?? '', solAddress: a.solana }, fiat, false, failed);
      // Seuls les réseaux servis par l'extension comptent (un compte sans adresse TON n'en lit aucun).
      const ours = fresh.filter((h) => FAMILIES.has(chainOf(h.chainId)?.family ?? ''));
      const holdings = carryOver(before?.holdings ?? [], ours, failed);
      const snap: Snapshot = { holdings, ...summarize(holdings), at: now() };
      const failedChains = [...new Set([...failed].map((f) => f.split(':')[0]))].filter((id) => FAMILIES.has(chainOf(id)?.family ?? ''));
      await deps.disk.set(key('portfolio', a, fiat), { json: serialize(snap), failed: failedChains } satisfies StoredSnapshot);
      return toView(snap, failedChains, fiat);
    });
  }

  /* ── Activité ── */

  interface StoredActivity {
    at: number;
    json: string;
    failed: string[];
  }

  async function readActivity(a: Acct): Promise<{ at: number; txs: TxSummary[]; failed: string[] }> {
    const s = await deps.disk.get<StoredActivity>(key('activity', a));
    if (!s) return { at: 0, txs: [], failed: [] };
    try {
      return { at: s.at, txs: JSON.parse(s.json, reviver) as TxSummary[], failed: s.failed };
    } catch {
      return { at: 0, txs: [], failed: [] };
    }
  }

  /** Lignes lisibles, avec le même tri anti-spam que l'app. */
  async function activityView(a: Acct, fiat: string, at: number, txs: TxSummary[], failed: string[]): Promise<ActivityView> {
    const { snap } = await readSnapshot(a, fiat);
    const holdings = snap?.holdings ?? [];
    const trusted = buildTrusted(verifiedContracts(holdings));
    const own = [a.evm, a.solana].filter((x): x is string => !!x);
    const known = knownCounterparties(txs, trusted, own);
    const prices = new Map(holdings.filter((h) => h.verified && h.price > 0).map((h) => [h.symbol.toUpperCase(), h.price]));
    const money = new Intl.NumberFormat(deps.locale, { style: 'currency', currency: fiat.toUpperCase() });
    const ctx = {
      t: deps.t,
      nativeSymbol: 'ETH',
      nativeDecimals: 18,
      nativeOf: (id: string) => {
        const c = chainOf(id);
        return c ? { symbol: c.nativeSymbol, decimals: c.nativeDecimals } : undefined;
      },
      verifiedContracts: verifiedContracts(holdings),
      verifiedChainSymbols: verifiedChainSymbols(holdings),
      fiatOf: (symbol: string, amount: number) => {
        const p = prices.get(symbol.toUpperCase());
        return p && Number.isFinite(amount) ? money.format(amount * p) : undefined;
      },
      spamOf: (tx: TxSummary) => spamReason(tx, { trusted, known }),
    };
    let hiddenCount = 0;
    const rows: ActivityRow[] = [];
    for (const tx of txs) {
      const hu = humanizeTx(tx, ctx);
      if (hu.spam || hu.spamReason) {
        hiddenCount += 1;
        continue;
      }
      const c = chainOf(tx.chain);
      rows.push({
        hash: tx.hash,
        chainId: tx.chain,
        chainName: c?.name ?? tx.chain,
        chainLogo: chainLogo(tx.chain),
        timestamp: tx.timestamp,
        title: hu.title,
        label: hu.label,
        subtitle: hu.subtitle,
        amount: hu.amount,
        fiat: hu.fiat,
        tone: hu.tone,
        failed: hu.failed,
        pending: hu.pending,
        explorer: c?.explorerUrl && /^[A-Za-z0-9]+$/.test(tx.hash) ? `${c.explorerUrl}/tx/${tx.hash}` : undefined,
      });
    }
    return { at, rows, hiddenCount, failed: byPriority(failed).map(chainName) };
  }

  async function cachedActivity(a: Acct, fiat: string): Promise<ActivityView & { stale: boolean }> {
    const { at, txs, failed } = await readActivity(a);
    return { ...(await activityView(a, fiat, at, txs, failed)), stale: !at || now() - at > STALE_MS };
  }

  /** Historique des réseaux principaux et de ceux où le compte détient quelque chose. */
  function refreshActivity(a: Acct, fiat: string): Promise<ActivityView> {
    return once(key('activity', a), async () => {
      const { snap } = await readSnapshot(a, fiat);
      const before = await readActivity(a);
      const holdingChains = new Set((snap?.holdings ?? []).map((h) => h.chainId));
      const cachedChains = new Set(before.txs.map((t) => t.chain));
      const chains = pickHistoryChains(listChains({ includeTestnets: false }), holdingChains, cachedChains).filter(
        (c) => (c.family === 'evm' && a.evm) || (c.family === 'solana' && a.solana),
      );
      const failed: string[] = [];
      /*
       * Les adaptateurs du cœur rendent une liste VIDE quand l'indexeur ne
       * répond pas : impossible de distinguer « rien » de « muet ». Un réseau
       * muet à la dernière lecture des soldes, qui rend une liste vide, est
       * donc compté comme muet — jamais affiché comme « aucune activité ».
       */
      const silent = new Set((await deps.disk.get<StoredSnapshot>(key('portfolio', a, fiat)))?.failed ?? []);
      const lists = await Promise.all(
        chains.map(async (c) => {
          const address = c.family === 'evm' ? a.evm! : a.solana!;
          try {
            const got = await history(c.id, address);
            if (!got.length && silent.has(c.id)) throw new Error('SILENT');
            return got;
          } catch {
            failed.push(c.id);
            // Réseau muet : on garde ce qu'on en savait.
            return before.txs.filter((t) => t.chain === c.id);
          }
        }),
      );
      const seen = new Set<string>();
      const txs = lists
        .flat()
        .sort((x, y) => y.timestamp - x.timestamp)
        .filter((t) => {
          const k = `${t.chain}:${t.hash}:${t.direction}:${t.asset ?? ''}`;
          if (seen.has(k)) return false;
          seen.add(k);
          return true;
        })
        .slice(0, MAX_ACTIVITY);
      const at = now();
      await deps.disk.set(key('activity', a), { at, json: JSON.stringify(txs, replacer), failed } satisfies StoredActivity);
      return activityView(a, fiat, at, txs, failed);
    });
  }

  return { cached, refresh, cachedActivity, refreshActivity };
}

export type Portfolio = ReturnType<typeof makePortfolio>;
