/**
 * Portefeuille AGRÉGÉ multi-chaîne (§4.1) — une seule source pour l'accueil :
 * natifs de TOUS les réseaux mainnet + tokens ERC-20 (réseaux couverts par
 * Alchemy) + SPL Solana, valorisés dans la devise de l'app.
 *
 * Vitesse perçue (§0, §7) : l'instantané précédent est mis en CACHE
 * (AsyncStorage, non sensible) et affiché immédiatement à l'ouverture
 * (< 300 ms), puis rafraîchi en silence.
 */
import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  getAdapter,
  listChains,
  getPrices,
  getMarkets,
  getErc20Tokens,
  getTokenPrices,
  formatAmount,
  knownTokensFor,
  KNOWN_MINTS,
  SolanaChainAdapter,
  type ChainConfig,
} from '../../src';
import { safeNum } from '../earn/earnStore';
import { usePortfolio as useLegacyPortfolio } from '../portfolioStore';
import { aura } from '../aura';
import { didReceive } from './receive';

export interface Holding {
  /** `${chainId}:${contract|native}` */
  id: string;
  chainId: string;
  kind: 'native' | 'erc20' | 'spl';
  contract?: string;
  symbol: string;
  name: string;
  decimals: number;
  raw: bigint;
  /** Montant humain (nombre fini). */
  amount: number;
  logo?: string;
  price: number;
  fiat: number;
  /** Variation 24 h en % (null = inconnue). */
  change24h: number | null;
  coingeckoId?: string;
  /**
   * Token VÉRIFIÉ = natif, ou coté (prix CoinGecko), ou dans nos listes curées.
   * Un token reçu sans rien demander et inconnu des listes = airdrop spam probable :
   * masqué par défaut, jamais en vert, jamais de valeur inventée (§ sécurité).
   */
  verified: boolean;
}

export interface PortfolioAccount {
  evmAddress: string;
  solAddress?: string;
  btcAddress?: string;
}

interface Snapshot {
  holdings: Holding[];
  total: number;
  /** P&L 24 h en devise (null si aucune variation connue). */
  pnl24h: number | null;
  pnl24hPct: number | null;
  at: number;
}

interface PortfolioState extends Snapshot {
  loading: boolean;
  /** Clé du cache chargé (compte + devise). */
  key: string | null;
  fromCache: boolean;
  error: string | null;
  hydrate: (acct: PortfolioAccount, fiat: string) => Promise<void>;
  refresh: (acct: PortfolioAccount, fiat: string, opts?: { force?: boolean; includeTestnets?: boolean }) => Promise<void>;
}

const VALUE_CHAINS: ChainConfig[] = listChains({ includeTestnets: false }).filter((c) => c.coingeckoId);
const STALE_MS = 45_000;
const cacheKey = (a: PortfolioAccount, fiat: string) => `kalyx.portfolio.${a.evmAddress.toLowerCase()}.${fiat}`;

function serialize(s: Snapshot): string {
  return JSON.stringify({ ...s, holdings: s.holdings.map((h) => ({ ...h, raw: h.raw.toString() })) });
}
function deserialize(json: string): Snapshot | null {
  try {
    const o = JSON.parse(json) as Omit<Snapshot, 'holdings'> & { holdings: (Omit<Holding, 'raw'> & { raw: string })[] };
    return { ...o, holdings: o.holdings.map((h) => ({ ...h, raw: BigInt(h.raw), verified: (h as { verified?: boolean }).verified ?? (h.kind === 'native' || h.fiat > 0) })) };
  } catch {
    return null;
  }
}

function summarize(holdings: Holding[]): Pick<Snapshot, 'total' | 'pnl24h' | 'pnl24hPct'> {
  let total = 0;
  let past = 0;
  let known = false;
  for (const h of holdings) {
    total += h.fiat;
    if (h.change24h != null && h.change24h > -100) {
      past += h.fiat / (1 + h.change24h / 100);
      known = true;
    } else past += h.fiat;
  }
  const pnl = known ? total - past : null;
  return { total: safeNum(total), pnl24h: pnl == null ? null : safeNum(pnl), pnl24hPct: pnl == null || past <= 0 ? null : safeNum((pnl / past) * 100) };
}

async function loadHoldings(acct: PortfolioAccount, fiat: string, includeTestnets = false): Promise<Holding[]> {
  const chains = includeTestnets
    ? listChains({ includeTestnets: true }).filter((c) => c.coingeckoId || c.testnet)
    : VALUE_CHAINS;
  const ids = [...new Set(chains.map((c) => c.coingeckoId).filter((id): id is string => !!id))];

  /*
   * TOUT PART EN MÊME TEMPS, ET RIEN N'ATTEND CE DONT IL N'A PAS BESOIN.
   *
   * La version précédente enchaînait quatre étapes avec des `await` successifs :
   * les prix, PUIS les soldes natifs, PUIS les jetons ERC-20, PUIS les jetons
   * Solana. La durée totale était donc leur SOMME, alors qu'aucune de ces
   * requêtes ne dépend du résultat d'une autre — un prix ne sert qu'à convertir
   * un solde déjà connu. Un CoinGecko lent retardait à lui seul l'affichage de
   * tous les soldes.
   *
   * Les quatre partent maintenant ensemble et ne sont recollées qu'à la fin : la
   * durée devient celle de la plus lente.
   */
  const pricesP = Promise.all([
    getPrices(ids, fiat).catch(() => ({}) as Record<string, { price: number; change24h: number }>),
    getMarkets(fiat, 100).catch(() => []),
  ]);

  /** Soldes natifs bruts : la conversion en devise attend les prix, pas la lecture. */
  const rawNativesP = Promise.all(
    chains.map(async (chain) => {
      const address =
        chain.family === 'bitcoin' ? acct.btcAddress : chain.family === 'solana' ? acct.solAddress : acct.evmAddress;
      if (!address) return null;
      try {
        const raw = (await getAdapter(chain.id).getBalance(address)).raw;
        /*
         * Solde nul ou RPC muet : rien à montrer. On ne fabrique pas un faux 0 —
         * le cache garde l'ancienne valeur, ce qui vaut mieux qu'un zéro inventé.
         */
        return raw === 0n ? null : { chain, raw };
      } catch {
        return null;
      }
    }),
  );

  // ERC-20 sur les réseaux couverts par Alchemy ; le spam est déjà filtré par
  // `getErc20Tokens`.
  const evmChains = VALUE_CHAINS.filter(
    (c) => c.family === 'evm' && c.coingeckoPlatform && c.rpcUrls.some((u) => u.includes('.alchemy.com')),
  );
  const erc20P = Promise.all(
    evmChains.map(async (chain): Promise<Holding[]> => {
      try {
        const list = await getErc20Tokens(chain, acct.evmAddress);
        if (!list.length) return [];
        const tp = await getTokenPrices(
          chain.coingeckoPlatform!,
          list.map((t) => t.contract),
          fiat,
        ).catch(() => ({}) as Record<string, number>);
        const known = new Set(knownTokensFor(chain.evmChainId).map((a: string) => a.toLowerCase()));
        return list.map((t) => {
          const price = safeNum(tp[t.contract.toLowerCase()]);
          const amount = safeNum(Number(formatAmount(t.raw, t.decimals)));
          const verified = price > 0 || known.has(t.contract.toLowerCase());
          return {
            id: `${chain.id}:${t.contract.toLowerCase()}`,
            chainId: chain.id,
            kind: 'erc20' as const,
            contract: t.contract,
            symbol: t.symbol,
            name: t.name,
            decimals: t.decimals,
            raw: t.raw,
            amount,
            logo: t.logo,
            price,
            fiat: verified ? safeNum(amount * price) : 0,
            change24h: null,
            verified,
          };
        });
      } catch {
        return [];
      }
    }),
  );

  // Jetons SPL. Lancé lui aussi sans attendre : il ne dépend de rien d'autre.
  const splP: Promise<Holding[]> = (async () => {
    if (!acct.solAddress) return [];
    try {
      const a = getAdapter('solana');
      const list = a instanceof SolanaChainAdapter ? await a.getSplTokens(acct.solAddress) : [];
      const tp = list.length
        ? await getTokenPrices(
            'solana',
            list.map((t) => t.mint),
            fiat,
          ).catch(() => ({}) as Record<string, number>)
        : {};
      return list.map((t) => {
        const price = safeNum(tp[t.mint.toLowerCase()]);
        const amount = safeNum(Number(formatAmount(t.raw, t.decimals)));
        const verified = price > 0 || !!KNOWN_MINTS[t.mint];
        return {
          id: `solana:${t.mint}`,
          chainId: 'solana',
          kind: 'spl' as const,
          contract: t.mint,
          symbol: t.symbol,
          name: t.name,
          decimals: t.decimals,
          raw: t.raw,
          amount,
          logo: t.logo,
          price,
          fiat: verified ? safeNum(amount * price) : 0,
          change24h: null,
          verified,
        };
      });
    } catch {
      return [];
    }
  })();

  const [[prices, markets], rawNatives, erc20, spl] = await Promise.all([pricesP, rawNativesP, erc20P, splP]);
  const logos = new Map(markets.map((m) => [m.id, m.image]));

  const natives: Holding[] = rawNatives
    .filter((x): x is { chain: (typeof chains)[number]; raw: bigint } => x !== null)
    .map(({ chain, raw }) => {
      const p = chain.coingeckoId ? prices[chain.coingeckoId] : undefined;
      const amount = safeNum(Number(formatAmount(raw, chain.nativeDecimals)));
      return {
        id: `${chain.id}:native`,
        chainId: chain.id,
        kind: 'native' as const,
        symbol: chain.nativeSymbol,
        // `name` identifie l'actif, jamais le réseau : « Base » est un réseau
        // dont le natif est ETH, « BNB Chain » porte du BNB.
        name: chain.nativeSymbol,
        decimals: chain.nativeDecimals,
        raw,
        amount,
        logo: chain.coingeckoId ? logos.get(chain.coingeckoId) : undefined,
        price: safeNum(p?.price),
        fiat: safeNum(amount * safeNum(p?.price)),
        change24h: p ? safeNum(p.change24h) : null,
        coingeckoId: chain.coingeckoId,
        verified: true,
      };
    });

  const all = [...natives, ...erc20.flat(), ...spl];
  // Tri par valeur ; sans prix → après, par montant.
  return all.sort((a, b) => b.fiat - a.fiat || b.amount - a.amount);
}

export const usePortfolioStore = create<PortfolioState>((set, get) => ({
  holdings: [],
  total: 0,
  pnl24h: null,
  pnl24hPct: null,
  at: 0,
  loading: false,
  key: null,
  fromCache: false,
  error: null,

  hydrate: async (acct, fiat) => {
    const key = cacheKey(acct, fiat);
    if (get().key === key) return;
    try {
      const json = await AsyncStorage.getItem(key);
      const snap = json ? deserialize(json) : null;
      if (snap) set({ ...snap, key, fromCache: true, error: null });
      else set({ holdings: [], total: 0, pnl24h: null, pnl24hPct: null, at: 0, key, fromCache: false });
    } catch {
      set({ key });
    }
  },

  refresh: async (acct, fiat, opts) => {
    const includeTestnets = opts?.includeTestnets === true;
    const key = `${cacheKey(acct, fiat)}.${includeTestnets ? 'testnets' : 'mainnet'}`;
    const s = get();
    if (s.loading) return;
    if (!opts?.force && s.key === key && !s.fromCache && Date.now() - s.at < STALE_MS) return;
    set({ loading: true, error: null });
    // `loading` suffit : l'ambiance Synchronisation en est DÉRIVÉE par
    // lib/auraBinding.ts. Ce store n'a pas à connaître le halo, il n'émet que
    // ce que le halo ne peut pas déduire : les événements.
    const before = s.holdings;
    try {
      const holdings = await loadHoldings(acct, fiat, includeTestnets);
      const snap: Snapshot = { holdings, ...summarize(holdings), at: Date.now() };
      set({ ...snap, key, fromCache: false, loading: false });
      if (didReceive(before, holdings)) aura.pulse('receive');
      AsyncStorage.setItem(key, serialize(snap)).catch(() => {});
      // Résumé pour l'assistant IA (ancien store, conservé pour compatibilité).
      useLegacyPortfolio.getState().setPortfolio(
        snap.total,
        holdings.slice(0, 12).map((h) => `- ${h.symbol}: ${h.amount} (~ ${h.fiat.toFixed(2)} ${fiat})`),
        snap.pnl24h ?? undefined,
        snap.pnl24hPct ?? undefined,
      );
    } catch (e) {
      set({ loading: false, error: e instanceof Error ? e.message : 'Réseau indisponible' });
      aura.pulse('error');
    }
  },
}));

/**
 * Répartition d'affichage (§4.1 + sécurité) :
 *  - main    : vérifiés, valeur ≥ 1 (ou natif sans prix)
 *  - small   : vérifiés, petits soldes (< 1) — repliés
 *  - hidden  : NON vérifiés (spam probable) — section « Masqués », gris, sans « + »
 */
export function splitHoldings(holdings: Holding[], threshold = 1): { main: Holding[]; small: Holding[]; hidden: Holding[] } {
  const main: Holding[] = [];
  const small: Holding[] = [];
  const hidden: Holding[] = [];
  for (const h of holdings) {
    if (!h.verified) hidden.push(h);
    else if (h.fiat >= threshold || (h.price === 0 && h.kind === 'native')) main.push(h);
    else small.push(h);
  }
  return { main, small, hidden };
}
/** @deprecated → splitHoldings */
export function splitSmall(holdings: Holding[], threshold = 1): { main: Holding[]; small: Holding[] } {
  const r = splitHoldings(holdings, threshold);
  return { main: r.main, small: r.small };
}
/** Symboles des tokens vérifiés (pour classer l'activité). */
export function verifiedSymbols(holdings: Holding[]): Set<string> {
  return new Set(holdings.filter((h) => h.verified).map((h) => h.symbol.toUpperCase()));
}
