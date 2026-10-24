/**
 * NFT du compte affiché, en LECTURE SEULE : aucune signature, aucun envoi.
 *
 * Sources, toutes par le relais Kalyx (aucune clé dans l'extension) :
 *  - EVM : l'API NFT d'Alchemy (`/nft/<réseau>`), lue par le cœur (getNfts) ;
 *  - Solana : DAS `getAssetsByOwner` (Helius), relu par le parseur du cœur.
 * Le spam est écarté par les règles du cœur (isSpam d'Alchemy, noms d'arnaque).
 *
 * Réseau muet : NOMMÉ, et ses NFT du cliché précédent restent — jamais
 * « aucun NFT » à cause d'une panne.
 *
 * Images : https seulement, ou une image inscrite dans le NFT (data:image) ;
 * dessinées par <img> (un SVG n'y exécute aucun script).
 */
import { getNftsChecked, type NftItem } from '../../src/domain/nft/alchemyNft';
import { parseDasNfts } from '../../src/domain/nft/solanaNft';
import { withTimeout } from '../../src/domain/chains/net';
import { isAlchemyRpc, isRelayUrl, noteRelayResponse, noteRelayUnreachable, relayPaused } from '../../src/domain/net/relay';
import { getAdapter } from '../../src/domain/chains/registry';
import type { ChainConfig } from '../../src/domain/chains/types';
import { viewChains } from './assets';
import { chainLogo, type Acct } from './portfolio';
import type { Store } from './storage';

const STALE_MS = 5 * 60_000;
const MAX_ITEMS = 200;
const MAX_SVG = 200_000;
const TIMEOUT = 15_000;

export interface NftView {
  key: string;
  chainId: string;
  chainName: string;
  chainLogo?: string;
  contract: string;
  tokenId: string;
  name: string;
  collection: string;
  /** Images à essayer dans l'ordre (la suivante si la précédente ne se charge pas). */
  images: string[];
  explorer?: string;
  floor?: { price: number; currency: string; source: string };
}

export interface NftsView {
  at: number;
  items: NftView[];
  /** Réseaux qui n'ont pas répondu (noms lisibles). */
  failed: string[];
}

/** Une image affichable sans risque : https, ou une image inscrite dans le NFT. */
export function safeImage(u: string | undefined): string | undefined {
  if (!u) return undefined;
  if (/^https:\/\/[^\s"'<>]+$/i.test(u)) return u;
  if (/^data:image\/(png|jpeg|gif|webp);base64,[A-Za-z0-9+/=]+$/.test(u) && u.length <= MAX_SVG) return u;
  return undefined;
}

function svgImage(svg: string | undefined): string | undefined {
  if (!svg || svg.length > MAX_SVG || !/^\s*(<\?xml[^>]*>\s*)?<svg[\s>]/i.test(svg)) return undefined;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function toView(chain: ChainConfig, n: NftItem): NftView {
  const images = [...new Set([n.image, ...(n.images ?? [])].map(safeImage).filter((u): u is string => !!u))];
  const svg = svgImage(n.svg);
  const evmIds = /^0x[0-9a-f]{40}$/i.test(n.contract) && /^\d{1,80}$/.test(n.tokenId);
  const explorer =
    n.url && /^https:\/\//.test(n.url) ? n.url : chain.explorerUrl && evmIds ? `${chain.explorerUrl}/token/${n.contract}?a=${n.tokenId}` : undefined;
  return {
    key: `${chain.id}:${n.contract}:${n.tokenId}`,
    chainId: chain.id,
    chainName: chain.name,
    chainLogo: chainLogo(chain.id),
    contract: n.contract,
    tokenId: n.tokenId,
    name: n.name,
    collection: n.collection,
    images: svg ? [svg, ...images] : images,
    explorer,
    // Plancher OpenSea : en ETH. Seuls les réseaux en ETH sont sûrs (comme l'app) ; ailleurs, rien plutôt qu'un prix deviné.
    ...(n.floor && chain.nativeSymbol === 'ETH' ? { floor: { price: n.floor.price, currency: 'ETH', source: n.floor.source } } : {}),
  };
}

/** Solana : DAS par le relais (le nœud public ne la sert pas). */
async function solanaViaRelay(chain: ChainConfig, owner: string): Promise<NftItem[]> {
  const url = chain.rpcUrls.find(isRelayUrl);
  if (!url || relayPaused('helius')) throw new Error('NFT indisponible');
  let res: Response;
  try {
    res = await withTimeout(
      fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'getAssetsByOwner',
          params: { ownerAddress: owner, page: 1, limit: 100, displayOptions: { showFungible: false, showCollectionMetadata: true } },
        }),
      }),
      TIMEOUT,
      () => new Error('timeout'),
    );
  } catch (e) {
    noteRelayUnreachable(url);
    throw e;
  }
  noteRelayResponse(url, res);
  if (!res.ok) throw new Error(`relais : HTTP ${res.status}`);
  const json = (await res.json()) as { result?: unknown };
  if (!json?.result) throw new Error('DAS');
  return parseDasNfts(json);
}

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

export interface NftsDeps {
  disk: Store;
  now?: () => number;
  /** Réseaux masqués (préférences d'affichage). */
  hiddenChains?: () => Promise<string[]>;
  /** Injectables pour les tests (sinon : le réseau, par le relais). */
  fetch?: (chain: ChainConfig, owner: string) => Promise<NftItem[]>;
  covers?: (chain: ChainConfig) => boolean;
}

/** Un fournisseur sait lister les NFT de ce réseau : Alchemy (EVM) ou Helius par le relais (Solana). */
const covered = (c: ChainConfig) => (c.family === 'evm' ? c.rpcUrls.some(isAlchemyRpc) : c.rpcUrls.some(isRelayUrl));

interface Stored {
  at: number;
  items: NftView[];
  failed: string[];
}

export function makeNfts(deps: NftsDeps) {
  const now = deps.now ?? Date.now;
  const read = async (chain: ChainConfig, owner: string): Promise<{ items: NftItem[]; unsupported: boolean }> =>
    deps.fetch ? { items: await deps.fetch(chain, owner), unsupported: false } : chain.family === 'solana' ? { items: await solanaViaRelay(chain, owner), unsupported: false } : getNftsChecked(chain, owner);
  /** Réseaux que l'API NFT ne couvre pas (réponse 4xx) : plus demandés pendant un jour (un refus passager ne les cache pas longtemps). */
  const SKIP_KEY = 'nfts.unsupported';
  const SKIP_MS = 86_400_000;
  const key = (a: Acct) => `nfts.${(a.evm ?? '').toLowerCase()}|${a.solana ?? ''}`;
  const inflight = new Map<string, Promise<NftsView>>();

  /** Réseaux lus : ceux qu'Alchemy (EVM) ou Helius (Solana) couvrent, et que le compte peut détenir. */
  async function chainsFor(a: Acct): Promise<ChainConfig[]> {
    const hidden = new Set(deps.hiddenChains ? await deps.hiddenChains() : []);
    const covers = deps.covers ?? covered;
    const skip = (await deps.disk.get<Record<string, number>>(SKIP_KEY)) ?? {};
    return viewChains().filter((c) => !hidden.has(c.id) && !((skip[c.id] ?? 0) > now()) && covers(c) && ((c.family === 'evm' && !!a.evm) || (c.family === 'solana' && !!a.solana)));
  }

  const nameOf = (id: string) => {
    try {
      return getAdapter(id).config.name;
    } catch {
      return id;
    }
  };

  async function show(a: Acct, s: Stored | undefined): Promise<NftsView & { stale: boolean }> {
    const hidden = new Set(deps.hiddenChains ? await deps.hiddenChains() : []);
    return {
      at: s?.at ?? 0,
      items: (s?.items ?? []).filter((n) => !hidden.has(n.chainId)),
      failed: (s?.failed ?? []).filter((id) => !hidden.has(id)).map(nameOf),
      stale: !s || now() - s.at > STALE_MS,
    };
  }

  async function cached(a: Acct) {
    return show(a, await deps.disk.get<Stored>(key(a)));
  }

  function refresh(a: Acct): Promise<NftsView> {
    const k = key(a);
    const running = inflight.get(k);
    if (running) return running;
    const p = (async () => {
      const before = await deps.disk.get<Stored>(k);
      const chains = await chainsFor(a);
      const failed: string[] = [];
      const unsupported: string[] = [];
      // Trois réseaux à la fois : le relais accepte 30 requêtes / 10 s par adresse, pages suivantes comprises.
      const lists = await mapLimit(chains, 3, async (c) => {
          try {
            const r = await read(c, c.family === 'solana' ? a.solana! : a.evm!);
            if (r.unsupported) unsupported.push(c.id);
            return r.items.map((n) => toView(c, n));
          } catch {
            failed.push(c.id);
            return (before?.items ?? []).filter((n) => n.chainId === c.id);
          }
      });
      const seen = new Set<string>();
      const items = lists.flat().filter((n) => (seen.has(n.key) ? false : (seen.add(n.key), true))).slice(0, MAX_ITEMS);
      const stored: Stored = { at: now(), items, failed };
      await deps.disk.set(k, stored);
      if (unsupported.length) {
        const skip = (await deps.disk.get<Record<string, number>>(SKIP_KEY)) ?? {};
        for (const id of unsupported) skip[id] = now() + SKIP_MS;
        await deps.disk.set(SKIP_KEY, skip);
      }
      const { stale: _s, ...v } = await show(a, stored);
      return v;
    })().finally(() => inflight.delete(k));
    inflight.set(k, p);
    return p;
  }

  return { cached, refresh };
}

export type Nfts = ReturnType<typeof makeNfts>;
