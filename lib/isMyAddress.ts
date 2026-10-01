/**
 * « Est-ce mon adresse ? » — à quel portefeuille et à quel compte appartient
 * une adresse collée, et sur quelle famille de réseaux. Utile avant de partager
 * une adresse de réception, ou pour vérifier qu'une adresse affichée ailleurs
 * (un exchange, un site) est bien la sienne.
 *
 * Les adresses de l'utilisateur sont calculées UNE fois (index), pas à chaque
 * frappe — l'adresse TON se recalcule en hachant le contrat. Comparaison par
 * `addressKey` : casse ignorée seulement là où elle ne compte pas (EVM, bech32).
 */
import { addressForChain, type AccountAddresses } from './accountAddress';
import { addressKey } from './txAuditProbe';

export type Family = 'evm' | 'solana' | 'bitcoin' | 'ton';
export type AddressMatch = { walletId: string; index: number; family: Family };
export type WalletAccounts<A> = { walletId: string; accounts: A[] };

export function buildAddressIndex<A extends AccountAddresses & { index: number }>(wallets: WalletAccounts<A>[]): Map<string, AddressMatch> {
  const index = new Map<string, AddressMatch>();
  const families: Family[] = ['evm', 'solana', 'bitcoin', 'ton'];
  for (const w of wallets) {
    for (const acc of w.accounts) {
      for (const family of families) {
        // Seule l'adresse TON change entre réseau principal et réseau de test.
        for (const testnet of family === 'ton' ? [false, true] : [false]) {
          const mine = addressForChain(acc, { family, testnet });
          if (!mine) continue;
          const k = addressKey(mine);
          if (!index.has(k)) index.set(k, { walletId: w.walletId, index: acc.index, family });
        }
      }
    }
  }
  return index;
}

export function lookupAddress(index: Map<string, AddressMatch>, address: string): AddressMatch | null {
  const a = address.trim();
  return a ? index.get(addressKey(a)) ?? null : null;
}
