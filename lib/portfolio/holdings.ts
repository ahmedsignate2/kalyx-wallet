/**
 * Calcul PUR du portefeuille agrégé : lecture des soldes natifs, tokens ERC-20
 * et SPL, jettons TON, prix, tri, reprise des réseaux muets, répartition.
 *
 * Sans React Native ni stockage : l'app (lib/portfolio/portfolioStore) et
 * l'extension navigateur s'en servent toutes les deux — mêmes soldes, mêmes
 * règles anti-spam, mêmes prix, sur les deux.
 *
 * Importe le cœur par chemins directs, jamais par le barrel `src/index` (qui
 * tire des modules natifs).
 */
import { getAdapter, listChains } from '../../src/domain/chains/registry';
import { getPrices, getMarkets, getTokenPrices } from '../../src/domain/prices/coingecko';
import { getErc20TokensStrict, type Erc20Token } from '../../src/domain/tokens/alchemyTokens';
import { getKnownErc20Tokens } from '../../src/domain/tokens/knownBalances';
import { getErc20ViaRelay } from '../../src/domain/tokens/relayTokens';
import { getRelayTokenPricesUsd } from '../../src/domain/prices/alchemyPrices';
import { isAlchemyRpc, isRelayUrl } from '../../src/domain/net/relay';
import { getLlamaTokenPricesUsd, getUsdFxRate, llamaKey } from '../../src/domain/prices/defillama';
import { formatAmount } from '../../src/domain/validation/amount';
import { knownTokensFor } from '../../src/domain/tokens/knownTokens';
import { KNOWN_MINTS } from '../../src/domain/tokens/splTokens';
import { SolanaChainAdapter } from '../../src/domain/chains/SolanaChainAdapter';
import type { ChainConfig } from '../../src/domain/chains/types';
import type { TonWalletVersion } from '../../src/domain/chains/ton/tonWallet';
import { safeNum } from '../num';
import type { PortfolioDiag } from './diagnostics';

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

export interface Snapshot {
  holdings: Holding[];
  total: number;
  /** P&L 24 h en devise (null si aucune variation connue). */
  pnl24h: number | null;
  pnl24hPct: number | null;
  at: number;
}


/**
 * Réseaux où Alchemy sert le RPC mais PAS l'API de jetons. Relevé le 27/09 :
 * Mantle répond « EAPIs not enabled on specified network: [MANTLE_MAINNET] »
 * (HTTP 400) — un refus définitif, pas une panne : inutile de le demander.
 */
const ALCHEMY_NO_TOKEN_API = new Set(['mantle']);

/** Référence dollar pour convertir les prix DefiLlama (en USD) dans la devise. */
const USD_PEG = 'tether';

const VALUE_CHAINS: ChainConfig[] = listChains({ includeTestnets: false }).filter((c) => c.coingeckoId);

export function serialize(s: Snapshot): string {
  return JSON.stringify({ ...s, holdings: s.holdings.map((h) => ({ ...h, raw: h.raw.toString() })) });
}
export function deserialize(json: string): Snapshot | null {
  try {
    const o = JSON.parse(json) as Omit<Snapshot, 'holdings'> & { holdings: (Omit<Holding, 'raw'> & { raw: string })[] };
    return { ...o, holdings: o.holdings.map((h) => ({ ...h, raw: BigInt(h.raw), verified: (h as { verified?: boolean }).verified ?? (h.kind === 'native' || h.fiat > 0) })) };
  } catch {
    return null;
  }
}

export function summarize(holdings: Holding[]): Pick<Snapshot, 'total' | 'pnl24h' | 'pnl24hPct'> {
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
export type Failed = Set<string>;

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

/** Lecteur des jettons TON (lib/portfolio/jettons), injecté par l'app. */
export type JettonLoader = (acct: PortfolioAccount, chains: ChainConfig[], fiat: string, failed: Failed, diag?: PortfolioDiag) => Promise<Holding[]>;

/** Adresse d'un compte sur un réseau (lib/accountAddress dans l'app). */
export type AddressOf = (acct: PortfolioAccount, chain: ChainConfig) => string;

/**
 * Par défaut : EVM, Solana, Bitcoin — l'adresse TON se CALCULE (version du
 * contrat, réseau) et demande le module TON, que l'app fournit (`extras`).
 */
const plainAddressOf: AddressOf = (acct, chain) =>
  chain.family === 'evm' ? acct.evmAddress : chain.family === 'solana' ? (acct.solAddress ?? '') : chain.family === 'bitcoin' ? (acct.btcAddress ?? '') : '';

/** Ce que seule l'app fournit (TON) ; l'extension (EVM + Solana) s'en passe. */
export interface HoldingExtras {
  addressOf?: AddressOf;
  jettons?: JettonLoader;
}

export async function loadHoldings(acct: PortfolioAccount, fiat: string, includeTestnets = false, failed: Failed = new Set(), diag?: PortfolioDiag, extras: HoldingExtras = {}): Promise<Holding[]> {
  const addressForChain = extras.addressOf ?? plainAddressOf;
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

  /*
   * ERC-20. Trois sources, de la plus complète à la gratuite :
   *  1. RELAIS Kalyx (sans clé dans l'app) : TOUS les réseaux en UNE requête ;
   *  2. Alchemy en direct (clé) : réseau par réseau ;
   *  3. REPLI GRATUIT : les tokens principaux (USDC, USDT…) lus sur les nœuds
   *     publics — quand les deux premiers manquent ou sont au bout de leur
   *     quota. La liste est alors réduite, jamais inventée.
   * Le spam est déjà filtré. Les LISTES seulement : les prix viennent ensuite, groupés.
   * Sans adresse EVM (clé Solana importée), aucune liste à demander : ce n'est pas un échec.
   */
  const evmAll = !acct.evmAddress ? [] : VALUE_CHAINS.filter((c) => c.family === 'evm' && c.coingeckoPlatform);
  const alchemyOk = (c: ChainConfig) => c.rpcUrls.some(isAlchemyRpc) && !ALCHEMY_NO_TOKEN_API.has(c.id);
  const evmChains = evmAll.filter((c) => alchemyOk(c) || knownTokensFor(c.evmChainId).length > 0);
  const relayed = evmAll.filter((c) => alchemyOk(c) && c.rpcUrls.some((u) => isAlchemyRpc(u) && isRelayUrl(u)) && !c.rpcUrls.some((u) => isAlchemyRpc(u) && !isRelayUrl(u)));
  const relayP: Promise<Map<string, Erc20Token[] | Error>> = relayed.length && acct.evmAddress ? getErc20ViaRelay(acct.evmAddress, relayed).catch((e: Error) => new Map(relayed.map((c) => [c.id, e]))) : Promise.resolve(new Map());
  // Quatre réseaux à la fois : quatorze requêtes simultanées déclenchaient les
  // refus d'Alchemy (HTTP 429) — et des jetons qui disparaissaient.
  const erc20ListsP = relayP.then((fromRelay) => mapLimit(evmChains, 4, async (chain) => {
    let first: unknown = null;
    try {
      const r = fromRelay.get(chain.id);
      if (r instanceof Error) throw r;
      const list = r ?? (alchemyOk(chain) && !relayed.includes(chain) ? await getErc20TokensStrict(chain, acct.evmAddress) : null);
      if (list) {
        if (diag) diag.erc20[chain.id] = list.length;
        return { chain, list };
      }
    } catch (e) {
      first = e;
    }
    try {
      const list = await getKnownErc20Tokens(chain, acct.evmAddress);
      if (diag) diag.erc20[chain.id] = first ? `${list.length} (repli : tokens principaux — ${note(first)})` : list.length;
      return { chain, list };
    } catch (e) {
      failed.add(`${chain.id}:tokens`);
      if (diag) diag.erc20[chain.id] = `ÉCHEC ${note(first ?? e)}`;
      return { chain, list: [] };
    }
  }));

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
    const llamaUp = Object.keys(usd).length > 0;
    /*
     * DEUXIÈME SOURCE : les tokens ERC-20 que DefiLlama n'a pas chiffrés sont
     * demandés aux prix Alchemy, par le relais (rien sans relais, rien s'il est
     * en pause). Seulement les manquants : le quota ne sert qu'aux trous.
     */
    const unpriced = erc20Lists.flatMap(({ chain, list }) => list.filter((t) => !usd[llamaKey(chain.id, t.contract)]).map((t) => ({ chain, address: t.contract })));
    if (unpriced.length) Object.assign(usd, await getRelayTokenPricesUsd(unpriced).catch(() => ({})));
    if (diag) diag.prices = { asked: refs.length, got: Object.keys(usd).length, fx };
    /*
     * Repli CoinGecko UNE fois par réseau. Il était appelé une fois par JETON,
     * chaque fois avec la liste complète : sur un gros compte (des centaines de
     * jetons), des centaines de requêtes identiques — refusées, et l'écran figé.
     */
    const fallback = new Map<string, Promise<Record<string, number>>>();
    const priceOf = async (chainId: string, address: string, platform: string | undefined, all: string[]): Promise<number> => {
      const p = usd[llamaKey(chainId, address)];
      if (p && fx > 0) return p * fx;
      if (llamaUp || !platform) return 0;
      // Repli CoinGecko, par réseau, seulement si DefiLlama est entièrement muet.
      let tpP = fallback.get(platform);
      if (!tpP) {
        tpP = getTokenPrices(platform, all, fiat).catch(() => ({}) as Record<string, number>);
        fallback.set(platform, tpP);
      }
      return safeNum((await tpP)[address.toLowerCase()]);
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

  // Jettons TON : chargés par l'appelant qui sert TON (l'app), absents ailleurs.
  const jettonsP: Promise<Holding[]> = extras.jettons ? extras.jettons(acct, chains, fiat, failed, diag) : Promise.resolve([]);

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
/** Contrats des tokens vérifiés, `chaîne:adresse` en minuscules (un symbole se copie, une adresse non). */
export function verifiedContracts(holdings: Holding[]): Set<string> {
  return new Set(holdings.filter((h) => h.verified && h.contract).map((h) => `${h.chainId}:${h.contract!.toLowerCase()}`));
}
/** Symboles vérifiés par chaîne, `chaîne:SYMBOLE` (un même symbole, autre contrat, même chaîne = imitation). */
export function verifiedChainSymbols(holdings: Holding[]): Set<string> {
  return new Set(holdings.filter((h) => h.verified && h.contract).map((h) => `${h.chainId}:${h.symbol.toUpperCase()}`));
}
/** Symboles des tokens vérifiés (pour classer l'activité). */
export function verifiedSymbols(holdings: Holding[]): Set<string> {
  return new Set(holdings.filter((h) => h.verified).map((h) => h.symbol.toUpperCase()));
}
