/**
 * Adresses de DON de Kalyx — source unique (écran « Soutenez-nous », README).
 *
 * Ce sont des adresses de RÉCEPTION publiques. Toute modification doit être
 * confirmée par le propriétaire : une faute de frappe enverrait les dons ailleurs.
 *
 * - BTC : confirmée par le propriétaire (l'ancienne adresse du README, bc1qwdqes…,
 *   n'est PLUS la bonne).
 * - EVM : la même adresse sur tous les réseaux EVM ; l'écran propose d'abord les
 *   réseaux à frais bas (Base, Arbitrum) avant Ethereum.
 * - TON : forme W5 non rebondissante (UQ…) du propriétaire de `kalyxwallet.ton`.
 *   Le nom est résolu au moment du don et COMPARÉ à cette constante : une
 *   différence est signalée avant l'envoi (domaine expiré, transféré…).
 */

import { parseRawTonAddress, parseTonAddress, toRawTonAddress } from '../domain/chains/ton/tonAddress';

export type DonationFamily = 'bitcoin' | 'evm' | 'solana' | 'ton';

export interface DonationTarget {
  key: 'bitcoin' | 'ethereum' | 'solana' | 'ton';
  family: DonationFamily;
  name: string;
  symbol: string;
  address: string;
  /** Réseaux Kalyx (ids du registre) proposés pour le don, dans l'ordre de préférence. */
  chains: readonly string[];
  /** Nom lisible (TON DNS) associé à l'adresse. */
  domain?: string;
}

export const DONATION_BTC = 'bc1qkalyxyueng23j7elpqrk4pcp3thp94u6cs5rkn';
export const DONATION_EVM = '0x7411b6a0b4df0f3a0bab9fe2c5d5cb47ddbdb69b';
export const DONATION_SOL = 'KALYXiXBdhzuEyFuPx9EdoqyaiUcrBTT9k66v4C13jz';
export const DONATION_TON = 'UQBapKtQghRx5Wh1WpscDbNNH9kLIpdd89rSxMU5EJCmVBrU';
export const DONATION_TON_DOMAIN = 'kalyxwallet.ton';

/** Réseaux EVM proposés, frais les plus bas d'abord. */
export const DONATION_EVM_CHAINS = ['base', 'arbitrum', 'ethereum'] as const;

export const DONATIONS: readonly DonationTarget[] = [
  { key: 'bitcoin', family: 'bitcoin', name: 'Bitcoin', symbol: 'BTC', address: DONATION_BTC, chains: ['bitcoin'] },
  { key: 'ethereum', family: 'evm', name: 'Ethereum (EVM)', symbol: 'ETH', address: DONATION_EVM, chains: DONATION_EVM_CHAINS },
  { key: 'solana', family: 'solana', name: 'Solana', symbol: 'SOL', address: DONATION_SOL, chains: ['solana'] },
  { key: 'ton', family: 'ton', name: 'TON', symbol: 'TON', address: DONATION_TON, chains: ['ton'], domain: DONATION_TON_DOMAIN },
];

/** Libellé affiché comme bénéficiaire dans l'écran Envoyer. */
export const DONATION_PAYEE = 'Kalyx';

/**
 * Même compte TON, quelle que soit la forme (UQ… / EQ… / « 0:… ») : le nom
 * `kalyxwallet.ton` peut résoudre vers la forme brute ou rebondissante.
 */
export function sameTonAccount(a: string, b: string): boolean {
  const key = (s: string) => {
    const p = parseTonAddress(s) ?? parseRawTonAddress(s);
    return p ? toRawTonAddress(p) : null;
  };
  const ka = key(a);
  return !!ka && ka === key(b);
}
