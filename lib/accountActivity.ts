/**
 * Sonde d'activité d'un compte HD, pour la recherche des comptes à l'import.
 *
 * « Utilisé » = la moindre trace, sur l'une de ses adresses :
 *  - EVM : nonce > 0, solde natif > 0 ou un jeton ERC-20 détenu, sur les grands
 *    réseaux (une même adresse sur tous) — un compte qui n'a fait que RECEVOIR
 *    des USDT n'a ni nonce ni ETH, et n'est pas vide pour autant ;
 *  - Solana : au moins une signature ou un solde ;
 *  - Bitcoin : au moins une transaction (même si l'adresse a été vidée).
 *
 * Agrégation PAR FAMILLE, puis entre familles (combineActivity) : un seul RPC
 * EVM muet ne rend plus TOUT inconnu — la famille EVM est « vide » quand la
 * majorité de ses réseaux a répondu vide et qu'aucun n'a vu d'activité.
 */
import {
  BitcoinChainAdapter,
  EvmChainAdapter,
  SolanaChainAdapter,
  combineActivity,
  getAdapter,
  hasAnyErc20Balance,
  listChains,
  withTimeout,
  type AccountActivity,
} from '../src';

/** Réseaux EVM sondés : là où vit l'essentiel de l'activité. */
const EVM_PROBE_CHAINS = ['ethereum', 'base', 'arbitrum', 'optimism', 'polygon', 'bnb'];
const PROBE_TIMEOUT_MS = 10_000;

const timed = <T>(p: Promise<T>) => withTimeout(p, PROBE_TIMEOUT_MS, () => new Error('timeout'));
const asActivity = async (p: Promise<boolean>): Promise<AccountActivity> => {
  try {
    return (await timed(p)) ? 'used' : 'empty';
  } catch {
    return 'unknown';
  }
};

/** Famille EVM : utilisée si un réseau l'a vue ; vide si la MAJORITÉ a répondu vide ; sinon inconnue. */
export function evmFamilyActivity(results: AccountActivity[]): AccountActivity {
  if (results.includes('used')) return 'used';
  const empty = results.filter((r) => r === 'empty').length;
  return results.length && empty * 2 > results.length ? 'empty' : 'unknown';
}

async function evmActivity(address: string, known: Set<string>): Promise<AccountActivity | null> {
  const probes: Promise<AccountActivity>[] = [];
  for (const id of EVM_PROBE_CHAINS) {
    if (!known.has(id)) continue;
    const a = getAdapter(id);
    if (!(a instanceof EvmChainAdapter)) continue;
    probes.push(
      asActivity(
        (async () => {
          const [nonce, bal] = await Promise.all([a.getNonce(address), a.getBalance(address)]);
          if (nonce > 0 || bal.raw > 0n) return true;
          return hasAnyErc20Balance(a.config, address, (t, o) => a.getTokenBalanceStrict(t, o));
        })(),
      ),
    );
  }
  return probes.length ? evmFamilyActivity(await Promise.all(probes)) : null;
}

export async function probeAccountActivity(acc: { evmAddress?: string; solAddress?: string; btcAddress?: string }): Promise<AccountActivity> {
  const known = new Set(listChains().map((c) => c.id));
  const families: Promise<AccountActivity | null>[] = [];
  if (acc.evmAddress) families.push(evmActivity(acc.evmAddress, known));
  if (acc.solAddress && known.has('solana')) {
    const a = getAdapter('solana');
    if (a instanceof SolanaChainAdapter) {
      const addr = acc.solAddress;
      families.push(
        asActivity(
          Promise.all([a.rpc<unknown[]>('getSignaturesForAddress', [addr, { limit: 1 }]), a.getBalance(addr)]).then(([sigs, b]) => {
            if (!Array.isArray(sigs)) throw new Error('Réponse Solana illisible');
            return sigs.length > 0 || b.raw > 0n;
          }),
        ),
      );
    }
  }
  if (acc.btcAddress && known.has('bitcoin')) {
    const a = getAdapter('bitcoin');
    if (a instanceof BitcoinChainAdapter) families.push(asActivity(a.hasActivity(acc.btcAddress)));
  }
  // Utilisé dès qu'une famille le voit ; vide seulement si TOUTES ont répondu vide.
  return combineActivity((await Promise.all(families)).filter((r): r is AccountActivity => r !== null));
}
