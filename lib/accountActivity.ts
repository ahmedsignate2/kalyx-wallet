/**
 * Sonde d'activité d'un compte HD, pour la recherche des comptes à l'import.
 *
 * « Utilisé » = au moins une transaction ou un solde, sur l'une de ses
 * adresses :
 *  - EVM : nonce > 0 ou solde > 0 sur les grands réseaux (une même adresse sur
 *    tous) — le nonce compte les envois, le solde couvre un compte qui n'a fait
 *    que recevoir ;
 *  - Solana : au moins une signature ou un solde ;
 *  - Bitcoin : au moins une transaction (même si l'adresse a été vidée).
 * Un réseau muet donne « inconnu », jamais « vide » (accountDiscovery).
 */
import {
  BitcoinChainAdapter,
  EvmChainAdapter,
  SolanaChainAdapter,
  combineActivity,
  getAdapter,
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

export async function probeAccountActivity(acc: { evmAddress?: string; solAddress?: string; btcAddress?: string }): Promise<AccountActivity> {
  const known = new Set(listChains().map((c) => c.id));
  const probes: Promise<AccountActivity>[] = [];
  if (acc.evmAddress) {
    for (const id of EVM_PROBE_CHAINS) {
      if (!known.has(id)) continue;
      const a = getAdapter(id);
      if (!(a instanceof EvmChainAdapter)) continue;
      const addr = acc.evmAddress;
      probes.push(asActivity(Promise.all([a.getNonce(addr), a.getBalance(addr)]).then(([n, b]) => n > 0 || b.raw > 0n)));
    }
  }
  if (acc.solAddress && known.has('solana')) {
    const a = getAdapter('solana');
    if (a instanceof SolanaChainAdapter) {
      const addr = acc.solAddress;
      probes.push(
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
    if (a instanceof BitcoinChainAdapter) probes.push(asActivity(a.hasActivity(acc.btcAddress)));
  }
  /*
   * « Utilisé » dès qu'un réseau le voit, même si d'autres sont muets ; « vide »
   * seulement si TOUS ont répondu. Un compte EVM actif sur un seul réseau suffit.
   */
  return combineActivity(await Promise.all(probes));
}
