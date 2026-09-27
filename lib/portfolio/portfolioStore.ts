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
  getErc20TokensStrict,
  getTokenPrices,
  getLlamaTokenPricesUsd,
  getUsdFxRate,
  llamaKey,
  formatAmount,
  knownTokensFor,
  KNOWN_MINTS,
  SolanaChainAdapter,
  TonAdapterV2,
  findAdapterV2,
  type ChainConfig,
  type TonWalletVersion,
} from '../../src';
import { addressForChain } from '../accountAddress';
import { safeNum } from '../earn/earnStore';
import { usePortfolio as useLegacyPortfolio } from '../portfolioStore';
import { aura } from '../aura';
import { didReceive } from './receive';
import { usePortfolioDiag, type PortfolioDiag } from './diagnostics';
import { ALCHEMY_KEY } from '../../src/domain/chains/configs';

export interface Holding {
  /** `${chainId}:${contract|native}` */
  id: string;
  chainId: string;
  kind: 'native' | 'erc20' | 'spl' | 'jetton';
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
  /** Clé publique TON (hex) : l'adresse TON dépend du réseau, elle se calcule par chaîne. */
  tonPublicKey?: string;
  tonVersion?: TonWalletVersion;
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
  hydrate: (acct: PortfolioAccount, fiat: string, opts?: { includeTestnets?: boolean }) => Promise<void>;
  refresh: (acct: PortfolioAccount, fiat: string, opts?: { force?: boolean; includeTestnets?: boolean }) => Promise<void>;
  /** Vrai après un envoi : le prochain `refresh` ignore la fraîcheur. */
  invalidated: boolean;
  /** À appeler après un envoi : les soldes affichés ne sont plus justes. */
  invalidate: () => void;
}

/** Référence dollar pour convertir les prix DefiLlama (en USD) dans la devise. */
const USD_PEG = 'tether';

const VALUE_CHAINS: ChainConfig[] = listChains({ includeTestnets: false }).filter((c) => c.coingeckoId);
const STALE_MS = 45_000;
/*
 * Clé du cache : l'adresse EVM, ou à défaut la clé TON. Un portefeuille ouvert
 * par une phrase TON n'a PAS d'adresse EVM : avec la seule adresse EVM, tous ces
 * portefeuilles auraient partagé le même cache, « kalyx.portfolio..eur ».
 */
const accountKey = (a: PortfolioAccount, fiat: string) => `kalyx.portfolio.${(a.evmAddress || `ton:${a.tonPublicKey ?? ''}`).toLowerCase()}.${fiat}`;

/*
 * UNE seule clé pour lire et pour écrire. `hydrate` lisait « …eur » quand
 * `refresh` écrivait « …eur.mainnet » : le cache n'était jamais relu, et
 * comme les onglets remontent l'accueil à chaque passage, chaque retour
 * vidait les montants (squelettes) et rappelait tous les réseaux.
 */
export const snapshotKey = (a: PortfolioAccount, fiat: string, includeTestnets = false) =>
  `${accountKey(a, fiat)}.${includeTestnets ? 'testnets' : 'mainnet'}`;

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

/**
 * Lectures qui ont ÉCHOUÉ (tous les RPC du réseau muets), par source :
 * `${chainId}:native` ou `${chainId}:tokens`. Un échec n'est pas un solde nul :
 * `refresh` garde alors ce que le cliché précédent montrait pour cette source,
 * au lieu de faire disparaître des actifs bien réels.
 */
type Failed = Set<string>;

/**
 * Actifs du cliché précédent dont la source n'a pas pu être relue, et prix
 * précédent pour un actif dont le prix n'est pas arrivé cette fois : sans lui,
 * l'actif tombait à 0 et glissait dans « petits soldes » ou « masqués »,
 * pour revenir au chargement suivant.
 */
export function carryOver(previous: Holding[], fresh: Holding[], failed: Failed): Holding[] {
  const prev = new Map(previous.map((h) => [h.id, h]));
  const priced = fresh.map((h) => {
    const p = prev.get(h.id);
    if (h.price > 0 || !p || p.price <= 0) return h;
    const verified = h.verified || p.verified;
    return { ...h, price: p.price, fiat: verified ? h.amount * p.price : 0, change24h: h.change24h ?? p.change24h, verified };
  });
  const kept = failed.size ? previous.filter((h) => failed.has(`${h.chainId}:${h.kind === 'native' ? 'native' : 'tokens'}`) && !fresh.some((f) => f.id === h.id)) : [];
  return [...priced, ...kept].sort((a, b) => b.fiat - a.fiat || b.amount - a.amount);
}

/** `Promise.all` avec au plus `limit` tâches en vol, ordre des résultats conservé. */
async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

async function loadHoldings(acct: PortfolioAccount, fiat: string, includeTestnets = false, failed: Failed = new Set(), diag?: PortfolioDiag): Promise<Holding[]> {
  const note = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 160);
  const chains = includeTestnets
    ? listChains({ includeTestnets: true }).filter((c) => c.coingeckoId || c.testnet)
    : VALUE_CHAINS;
  // + l'USDT : son cours dans la devise sert de taux dollar → devise pour les prix de jetons.
  const ids = [...new Set([...chains.map((c) => c.coingeckoId).filter((id): id is string => !!id), USD_PEG])];

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
      // La fonction unique : sans elle, TON aurait interrogé TON Center avec l'adresse EVM.
      const address = addressForChain(acct, chain);
      if (!address) return null;
      try {
        const raw = (await getAdapter(chain.id).getBalance(address)).raw;
        if (diag) diag.nativesFailed = diag.nativesFailed.filter((c) => c !== chain.id);
        /*
         * Solde nul ou RPC muet : rien à montrer. On ne fabrique pas un faux 0 —
         * le cache garde l'ancienne valeur, ce qui vaut mieux qu'un zéro inventé.
         */
        return raw === 0n ? null : { chain, raw };
      } catch {
        failed.add(`${chain.id}:native`);
        diag?.nativesFailed.push(chain.id);
        return null;
      }
    }),
  );

  // ERC-20 sur les réseaux couverts par Alchemy ; le spam est déjà filtré par
  // `getErc20Tokens`. Les LISTES seulement : les prix viennent ensuite, groupés.
  const evmChains = VALUE_CHAINS.filter(
    (c) => c.family === 'evm' && c.coingeckoPlatform && c.rpcUrls.some((u) => u.includes('.alchemy.com')),
  );
  // Quatre réseaux à la fois : quatorze requêtes simultanées déclenchaient les
  // refus d'Alchemy (HTTP 429) — et des jetons qui disparaissaient.
  const erc20ListsP = mapLimit(evmChains, 4, async (chain) => {
    try {
      const list = await getErc20TokensStrict(chain, acct.evmAddress);
      if (diag) diag.erc20[chain.id] = list.length;
      return { chain, list };
    } catch (e) {
      failed.add(`${chain.id}:tokens`);
      if (diag) diag.erc20[chain.id] = `ÉCHEC ${note(e)}`;
      return { chain, list: [] };
    }
  });

  // Jetons SPL. Lancé lui aussi sans attendre : il ne dépend de rien d'autre.
  const splListP = (async () => {
    if (!acct.solAddress) return [];
    try {
      const a = getAdapter('solana');
      const l = a instanceof SolanaChainAdapter ? await a.getSplTokens(acct.solAddress) : [];
      if (diag) diag.spl = l.length;
      return l;
    } catch (e) {
      if (diag) diag.spl = `ÉCHEC ${note(e)}`;
      failed.add('solana:tokens');
      return [];
    }
  })();

  /*
   * PRIX DES JETONS : UNE requête DefiLlama pour tous les réseaux, en dollars,
   * convertie avec le cours de l'USDT dans la devise. Il y avait ici un appel
   * CoinGecko PAR RÉSEAU — 14 à chaque chargement, dont 9 refusés sur 14 lors
   * d'une mesure (HTTP 429) : les jetons restaient sans prix, donc à 0. CoinGecko
   * reste le repli si DefiLlama ne répond pas du tout.
   */
  const tokensP = Promise.all([erc20ListsP, splListP, pricesP]).then(async ([erc20Lists, splList, [prices]]) => {
    const refs = [
      ...erc20Lists.flatMap(({ chain, list }) => list.map((t) => ({ chainId: chain.id, address: t.contract }))),
      ...splList.map((t) => ({ chainId: 'solana', address: t.mint })),
      // Les pièces natives aussi : si CoinGecko est muet, elles gardent un prix.
      ...ids.filter((id) => id !== USD_PEG).map((id) => ({ chainId: 'coingecko', address: id })),
    ];
    const [usd, fxBackup] = await Promise.all([
      refs.length ? getLlamaTokenPricesUsd(refs).catch(() => ({}) as Record<string, number>) : Promise.resolve({} as Record<string, number>),
      // Taux de secours, demandé seulement si CoinGecko n'a pas donné l'USDT.
      fiat.toLowerCase() === 'usd' || prices[USD_PEG]?.price ? Promise.resolve(0) : getUsdFxRate(fiat).catch(() => 0),
    ]);
    const fx = fiat.toLowerCase() === 'usd' ? 1 : safeNum(prices[USD_PEG]?.price) || fxBackup;
    if (diag) diag.prices = { asked: refs.length, got: Object.keys(usd).length, fx };
    const llamaUp = Object.keys(usd).length > 0;
    const priceOf = async (chainId: string, address: string, platform: string | undefined, all: string[]): Promise<number> => {
      const p = usd[llamaKey(chainId, address)];
      if (p && fx > 0) return p * fx;
      if (llamaUp || !platform) return 0;
      // Repli CoinGecko, par réseau, seulement si DefiLlama est entièrement muet.
      const tp = await getTokenPrices(platform, all, fiat).catch(() => ({}) as Record<string, number>);
      return safeNum(tp[address.toLowerCase()]);
    };

    const erc20 = await Promise.all(
      erc20Lists.map(async ({ chain, list }) => {
        const known = new Set(knownTokensFor(chain.evmChainId).map((a: string) => a.toLowerCase()));
        const contracts = list.map((t) => t.contract);
        return Promise.all(
          list.map(async (t): Promise<Holding> => {
            const price = safeNum(await priceOf(chain.id, t.contract, chain.coingeckoPlatform, contracts));
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
          }),
        );
      }),
    );
    const mints = splList.map((t) => t.mint);
    const spl = await Promise.all(
      splList.map(async (t): Promise<Holding> => {
        const price = safeNum(await priceOf('solana', t.mint, 'solana', mints));
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
      }),
    );
    return { erc20: erc20.flat(), spl, usd, fx };
  });

  /*
   * Jettons TON. Prix et vérification viennent de TonAPI (CoinGecko ne cote pas
   * la plupart) : seul un jetton en liste blanche est « vérifié » et compté.
   * Le SYMBOLE ne prouve rien — de faux « USD₮ » circulent.
   */
  const jettonsP: Promise<Holding[]> = Promise.all(
    chains
      .filter((c) => c.family === 'ton')
      .map(async (chain): Promise<Holding[]> => {
        const address = addressForChain(acct, chain);
        const a = address ? findAdapterV2(chain.id) : undefined;
        if (!address || !(a instanceof TonAdapterV2) || !a.capabilities.tokens) return [];
        try {
          const js = await a.jettons(address, fiat);
          if (diag) diag.jettons = { ...(diag.jettons ?? {}), [chain.id]: js.length };
          return js.map((j) => {
            const amount = safeNum(Number(formatAmount(j.raw, j.decimals)));
            const verified = j.verification === 'whitelist';
            return {
              id: `${chain.id}:${j.master}`,
              chainId: chain.id,
              kind: 'jetton' as const,
              contract: j.master,
              symbol: j.symbol,
              name: j.name,
              decimals: j.decimals,
              raw: j.raw,
              amount,
              logo: j.image,
              price: verified ? safeNum(j.price) : 0,
              fiat: verified ? safeNum(amount * j.price) : 0,
              change24h: verified ? j.change24h : null,
              verified,
            };
          });
        } catch (e) {
          if (diag) diag.jettons = { ...(diag.jettons ?? {}), [chain.id]: `ÉCHEC ${note(e)}` };
          failed.add(`${chain.id}:tokens`);
          return [];
        }
      }),
  ).then((l) => l.flat());

  const [[prices, markets], rawNatives, { erc20, spl, usd, fx }, jettons] = await Promise.all([pricesP, rawNativesP, tokensP, jettonsP]);
  const logos = new Map(markets.map((m) => [m.id, m.image]));

  const natives: Holding[] = rawNatives
    .filter((x): x is { chain: (typeof chains)[number]; raw: bigint } => x !== null)
    .map(({ chain, raw }) => {
      const p = chain.coingeckoId ? prices[chain.coingeckoId] : undefined;
      // CoinGecko d'abord (il donne aussi la variation 24 h), DefiLlama converti sinon.
      const backup = chain.coingeckoId && fx > 0 ? safeNum(usd[llamaKey('coingecko', chain.coingeckoId)]) * fx : 0;
      const price = safeNum(p?.price) || backup;
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
        price,
        fiat: safeNum(amount * price),
        change24h: p ? safeNum(p.change24h) : null,
        coingeckoId: chain.coingeckoId,
        verified: true,
      };
    });

  const all = [...natives, ...erc20, ...spl, ...jettons];
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
  invalidated: false,

  invalidate: () => set({ invalidated: true }),

  hydrate: async (acct, fiat, opts) => {
    const key = snapshotKey(acct, fiat, opts?.includeTestnets === true);
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
    const key = snapshotKey(acct, fiat, includeTestnets);
    const s = get();
    if (s.loading) return;
    // L'âge du CLICHÉ décide, qu'il vienne du disque ou du réseau : un cliché
    // relu du disque il y a dix secondes n'a pas à être redemandé.
    if (!opts?.force && !s.invalidated && s.key === key && Date.now() - s.at < STALE_MS) return;
    set({ loading: true, error: null, invalidated: false });
    // `loading` suffit : l'ambiance Synchronisation en est DÉRIVÉE par
    // lib/auraBinding.ts. Ce store n'a pas à connaître le halo, il n'émet que
    // ce que le halo ne peut pas déduire : les événements.
    const before = s.holdings;
    try {
      const failed: Failed = new Set();
      const diag: PortfolioDiag = { at: Date.now(), ms: 0, erc20: {}, nativesFailed: [], prices: { asked: 0, got: 0, fx: 0 }, holdings: 0 };
      // Un réseau muet garde ses actifs du cliché précédent : jamais de solde qui disparaît.
      const holdings = carryOver(s.key === key ? before : [], await loadHoldings(acct, fiat, includeTestnets, failed, diag), failed);
      usePortfolioDiag.getState().set({ ...diag, ms: Date.now() - diag.at, holdings: holdings.length, alchemyKey: ALCHEMY_KEY.length });
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
      usePortfolioDiag.getState().set({ at: Date.now(), ms: 0, error: e instanceof Error ? `${e.name}: ${e.message}` : String(e), erc20: {}, nativesFailed: [], prices: { asked: 0, got: 0, fx: 0 }, holdings: 0 });
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
  /*
   * « Petit » est RELATIF au portefeuille : moins de 1 % du total, plafonné au
   * seuil. Avec un seuil fixe de 1, un portefeuille de 0,31 € avait TOUS ses
   * jetons repliés — relevé sur un vrai compte, où l'accueil semblait vide.
   */
  const total = holdings.reduce((s, h) => s + (h.verified ? h.fiat : 0), 0);
  const cut = Math.min(threshold, total * 0.01);
  for (const h of holdings) {
    if (!h.verified) hidden.push(h);
    else if (h.fiat >= cut && h.fiat > 0 || (h.price === 0 && h.kind === 'native')) main.push(h);
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
