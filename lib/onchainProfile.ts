/**
 * Lecture du profil on-chain d'un compte (cf. `src/domain/profile/onchainProfile`).
 * Réseaux lus en parallèle, chacun borné dans le temps ; une panne est nommée.
 */
import { isAlchemyRpc } from '../src/domain/net/relay';
import {
  BitcoinChainAdapter,
  EvmChainAdapter,
  SolanaChainAdapter,
  getAdapter,
  listChains,
  withTimeout,
} from '../src';
import { alchemyCategories } from '../src/domain/chains/alchemy';
import { firstTransferBody, parseFirstTransfer, parseSolanaSignatures, summarize, type ChainActivity, type OnchainProfile } from '../src/domain/profile/onchainProfile';

/** Réseaux EVM lus : là où vit l'essentiel de l'activité (mêmes que la recherche de comptes, plus quelques L2). */
const EVM_CHAINS = ['ethereum', 'base', 'arbitrum', 'optimism', 'polygon', 'bnb', 'avalanche', 'linea', 'zksync', 'scroll'];
const TIMEOUT = 12_000;
const SOL_LIMIT = 1000;

const timed = <T>(p: Promise<T>) => withTimeout(p, TIMEOUT, () => new Error('timeout'));

async function firstTransfer(rpc: string, address: string, chainId: string): Promise<number | undefined> {
  const ask = (side: 'from' | 'to') =>
    fetch(rpc, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: firstTransferBody(address, side, alchemyCategories(chainId)) })
      .then((r) => r.json())
      .then(parseFirstTransfer, () => undefined);
  const dates = (await Promise.all([ask('from'), ask('to')])).filter((d): d is number => d !== undefined);
  return dates.length ? Math.min(...dates) : undefined;
}

async function evm(chainId: string, address: string): Promise<ChainActivity> {
  const a = getAdapter(chainId);
  if (!(a instanceof EvmChainAdapter)) throw new Error('not evm');
  const alchemy = a.config.rpcUrls.find(isAlchemyRpc);
  const [nonce, firstAt] = await Promise.all([a.getNonce(address), alchemy ? firstTransfer(alchemy, address, chainId) : Promise.resolve(undefined)]);
  return { chainId, txCount: nonce, ...(firstAt ? { firstAt } : {}) };
}

export async function loadOnchainProfile(acc: { evmAddress?: string; solAddress?: string; btcAddress?: string }): Promise<OnchainProfile> {
  const known = new Set(listChains().map((c) => c.id));
  const jobs: { chainId: string; run: () => Promise<ChainActivity> }[] = [];
  if (acc.evmAddress) for (const id of EVM_CHAINS) if (known.has(id)) jobs.push({ chainId: id, run: () => evm(id, acc.evmAddress!) });
  if (acc.solAddress && known.has('solana')) {
    jobs.push({
      chainId: 'solana',
      run: async () => {
        const a = getAdapter('solana');
        if (!(a instanceof SolanaChainAdapter)) throw new Error('solana');
        return { chainId: 'solana', ...parseSolanaSignatures(await a.rpc<unknown>('getSignaturesForAddress', [acc.solAddress, { limit: SOL_LIMIT }]), SOL_LIMIT) };
      },
    });
  }
  if (acc.btcAddress && known.has('bitcoin')) {
    jobs.push({
      chainId: 'bitcoin',
      run: async () => {
        const a = getAdapter('bitcoin');
        if (!(a instanceof BitcoinChainAdapter)) throw new Error('bitcoin');
        return { chainId: 'bitcoin', txCount: await a.getTxCount(acc.btcAddress!) };
      },
    });
  }
  const results = await Promise.all(jobs.map((j) => timed(j.run()).then((r) => ({ ok: r }), () => ({ failed: j.chainId }))));
  const chains: ChainActivity[] = [];
  const failed: string[] = [];
  for (const r of results) {
    if ('ok' in r) chains.push(r.ok);
    else failed.push(r.failed);
  }
  return summarize(chains, failed);
}
