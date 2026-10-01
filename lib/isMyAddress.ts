/**
 * « Est-ce mon adresse ? » — à quel compte de ce portefeuille appartient une
 * adresse collée, et sur quelle famille de réseaux. Utile avant de partager une
 * adresse de réception, ou pour vérifier qu'une adresse affichée ailleurs (un
 * exchange, un site) est bien la sienne. Comparaison insensible aux écritures
 * (EVM en casse mixte, TON EQ…/UQ…).
 */
import { addressForChain, type AccountAddresses } from './accountAddress';
import { sameAddress } from './txAuditProbe';

export type Family = 'evm' | 'solana' | 'bitcoin' | 'ton';
export type AddressMatch = { index: number; family: Family };

export function findMyAddress<A extends AccountAddresses & { index: number }>(accounts: A[], address: string): AddressMatch | null {
  const a = address.trim();
  if (!a) return null;
  const families: Family[] = ['evm', 'solana', 'bitcoin', 'ton'];
  for (const acc of accounts) {
    for (const family of families) {
      for (const testnet of [false, true]) {
        const mine = addressForChain(acc, { family, testnet });
        if (mine && sameAddress(mine, a)) return { index: acc.index, family };
      }
    }
  }
  return null;
}
