/**
 * NFT AGRÉGÉS multi-chaîne (§4.1 NFT) : Alchemy sur les réseaux EVM couverts,
 * DAS (Helius) sur Solana, TonAPI sur TON. Chaque NFT porte sa chaîne (badge).
 * Miniatures = URLs déjà converties par le fournisseur (jamais de WebView, jamais
 * de lien tiré d'une description). Spam écarté à la source (`nftSpam.ts`).
 *
 * UN RAPPORT, PAS UNE LISTE. Chaque source avalait ses erreurs et rendait [] :
 * quand toutes tombaient, l'écran affirmait « aucun NFT » à quelqu'un qui en
 * possède. On distingue maintenant ce qui a répondu, ce qui est en panne, et ce
 * qui n'est pas configuré.
 */
import { getAdapter, listChains, getNfts, getSolanaNfts, findAdapterV2, TonAdapterV2, type NftItem } from '../../src';
import { NftUnavailableError } from '../../src/domain/nft/solanaNft';
import { isSpamNft } from '../../src/domain/nft/nftSpam';
import { addressForChain, type AccountAddresses } from '../accountAddress';

export interface ChainNft extends NftItem {
  chainId: string;
}

export interface NftReport {
  nfts: ChainNft[];
  /** Réseaux dont la lecture a échoué (panne, délai). */
  failed: string[];
  /** Réseaux sans fournisseur configuré (clé absente). */
  unavailable: string[];
  /** Réseaux effectivement interrogés. */
  asked: number;
}

type Part = { chainId: string; ok: ChainNft[] } | { chainId: string; err: 'failed' | 'unavailable' };

async function attempt(chainId: string, run: () => Promise<ChainNft[]>): Promise<Part> {
  try {
    return { chainId, ok: await run() };
  } catch (e) {
    return { chainId, err: e instanceof NftUnavailableError ? 'unavailable' : 'failed' };
  }
}

export async function loadNftReport(acct: AccountAddresses & { evmAddress: string }): Promise<NftReport> {
  const chains = listChains({ includeTestnets: false });
  const jobs: Promise<Part>[] = [];
  if (acct.evmAddress) {
    for (const c of chains.filter((x) => x.family === 'evm' && x.rpcUrls.some((u) => u.includes('.alchemy.com')))) {
      jobs.push(attempt(c.id, async () => (await getNfts(c, acct.evmAddress)).map((n) => ({ ...n, chainId: c.id }))));
    }
  }
  for (const c of chains.filter((x) => x.family === 'ton')) {
    const address = addressForChain(acct, c);
    const a = address ? findAdapterV2(c.id) : undefined;
    if (!address || !(a instanceof TonAdapterV2)) continue;
    jobs.push(
      attempt(c.id, async () =>
        (await a.nfts(address))
          .filter((n) => !isSpamNft({ name: n.name, collection: n.collectionName }))
          .map((n) => ({
            contract: n.collection || n.address,
            tokenId: n.address,
            name: n.name,
            collection: n.collectionName,
            image: n.image,
            url: c.explorerUrl ? `${c.explorerUrl}/nft/${n.address}` : undefined,
            chainId: c.id,
          })),
      ),
    );
  }
  if (acct.solAddress) {
    const sol = acct.solAddress;
    jobs.push(attempt('solana', async () => (await getSolanaNfts(getAdapter('solana').config, sol)).map((n) => ({ ...n, chainId: 'solana' }))));
  }
  const parts = await Promise.all(jobs);
  const report: NftReport = { nfts: [], failed: [], unavailable: [], asked: parts.length };
  for (const p of parts) {
    if ('ok' in p) report.nfts.push(...p.ok);
    else if (p.err === 'unavailable') report.unavailable.push(p.chainId);
    else report.failed.push(p.chainId);
  }
  return report;
}

/** Compatibilité : la liste seule. */
export async function loadAllNfts(acct: AccountAddresses & { evmAddress: string }): Promise<ChainNft[]> {
  return (await loadNftReport(acct)).nfts;
}
