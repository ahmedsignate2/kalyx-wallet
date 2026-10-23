/**
 * Recherche des comptes déjà utilisés, à l'import d'une phrase : même
 * algorithme que le mobile (src/domain/wallet/accountDiscovery — on avance tant
 * qu'il y a de l'activité, arrêt après 3 comptes vides d'affilée), sonde
 * propre au navigateur.
 *
 * « Utilisé » = la moindre trace : nonce ou solde sur les grands réseaux EVM,
 * une signature ou un solde sur Solana, une transaction ou un solde sur Bitcoin. Un réseau muet rend « inconnu »,
 * jamais « vide » (on ne cache pas des fonds en concluant trop vite).
 */
import { combineActivity, discoverAccountIndexes, type AccountActivity } from '../../src/domain/wallet/accountDiscovery';
import { ARBITRUM, BASE, BNB, ETHEREUM, OPTIMISM, POLYGON, SOLANA } from '../../src/domain/chains/configs';
import type { ChainConfig } from '../../src/domain/chains/types';
import { getAdapter } from '../../src/domain/chains/registry';

/** Bitcoin : API REST (mempool.space, blockstream), pas du JSON-RPC — sonde à part, remplaçable dans les tests. */
export type BtcProbe = (address: string) => Promise<boolean>;
const btcProbe: BtcProbe = (address) => (getAdapter('bitcoin') as unknown as { hasActivity: BtcProbe }).hasActivity(address);

const TIMEOUT = 8_000;
const EVM = [ETHEREUM, BASE, ARBITRUM, OPTIMISM, POLYGON, BNB];

export type Rpc = (url: string, method: string, params: unknown[]) => Promise<unknown>;

export const fetchRpc: Rpc = async (url, method, params) => {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT);
  try {
    const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }), signal: ctrl.signal });
    const json = (await res.json()) as { result?: unknown; error?: unknown };
    if (json.error !== undefined || !('result' in json)) throw new Error('rpc');
    return json.result;
  } finally {
    clearTimeout(timer);
  }
};

/** Premier RPC qui répond (les suivants en repli). */
async function call(rpc: Rpc, chain: ChainConfig, method: string, params: unknown[]): Promise<unknown> {
  let last: unknown;
  for (const url of chain.rpcUrls.slice(0, 3)) {
    try {
      return await rpc(url, method, params);
    } catch (e) {
      last = e;
    }
  }
  throw last ?? new Error('rpc');
}

const hexPositive = (v: unknown) => typeof v === 'string' && /^0x[0-9a-f]+$/i.test(v) && BigInt(v) > 0n;

async function evmActivity(rpc: Rpc, chain: ChainConfig, address: string): Promise<AccountActivity> {
  try {
    const [nonce, balance] = await Promise.all([call(rpc, chain, 'eth_getTransactionCount', [address, 'latest']), call(rpc, chain, 'eth_getBalance', [address, 'latest'])]);
    if (typeof nonce !== 'string' || typeof balance !== 'string') return 'unknown';
    return hexPositive(nonce) || hexPositive(balance) ? 'used' : 'empty';
  } catch {
    return 'unknown';
  }
}

async function solActivity(rpc: Rpc, address: string): Promise<AccountActivity> {
  try {
    const sigs = await call(rpc, SOLANA, 'getSignaturesForAddress', [address, { limit: 1 }]);
    if (!Array.isArray(sigs)) return 'unknown';
    if (sigs.length) return 'used';
    const bal = (await call(rpc, SOLANA, 'getBalance', [address])) as { value?: number };
    return typeof bal?.value === 'number' ? (bal.value > 0 ? 'used' : 'empty') : 'unknown';
  } catch {
    return 'unknown';
  }
}

/** Activité d'un compte, tous réseaux : utilisé si l'un le voit, vide seulement si TOUS répondent vide. */
export async function accountActivity(rpc: Rpc, evm: string | undefined, solana: string | undefined, bitcoin?: string, btc: BtcProbe = btcProbe): Promise<AccountActivity> {
  const probes: Promise<AccountActivity>[] = [];
  if (evm) for (const c of EVM) probes.push(evmActivity(rpc, c, evm));
  if (solana) probes.push(solActivity(rpc, solana));
  if (bitcoin) probes.push(btc(bitcoin).then((used): AccountActivity => (used ? 'used' : 'empty'), (): AccountActivity => 'unknown'));
  return combineActivity(await Promise.all(probes));
}

export async function discoverAccounts(
  addressesOf: (index: number) => Promise<{ evm?: string; solana?: string; bitcoin?: string }>,
  rpc: Rpc = fetchRpc,
  onProgress?: (index: number) => void,
  btc: BtcProbe = btcProbe,
) {
  return discoverAccountIndexes(async (i) => {
    const a = await addressesOf(i);
    return accountActivity(rpc, a.evm, a.solana, a.bitcoin, btc);
  }, { onProgress });
}
