/**
 * Quel PORTEFEUILLE une phrase de récupération ouvre-t-elle ?
 *
 * - `'bip39'` : un portefeuille multi-chaînes — EVM, Bitcoin, Solana depuis la
 *   graine BIP-39, et TON selon la règle de Tonkeeper (`tonKeys.ts`). Toutes les
 *   phrases créées par Kalyx, MetaMask ou Trust.
 * - `'ton'` : une phrase Tonkeeper, qui n'est PAS une phrase BIP-39. Elle n'ouvre
 *   QUE TON. Lui faire dériver des comptes EVM, Bitcoin ou Solana produirait des
 *   adresses qu'aucun autre portefeuille ne montre pour cette phrase — les fonds
 *   qu'on y recevrait seraient invisibles partout ailleurs. Même raisonnement que
 *   pour une clé brute importée, qui ne sert que sa famille.
 * - `null` : ni l'une ni l'autre.
 *
 * ## Deux ordres, deux questions
 *
 * Ici BIP-39 est testé EN PREMIER, alors que `tonKeyKind` teste TON en premier.
 * Ce n'est pas une contradiction : ce sont deux questions différentes.
 *
 * - Quel portefeuille ? Une phrase valide dans les deux systèmes est d'abord une
 *   phrase BIP-39 — MetaMask et Trust l'acceptent, elle a des comptes EVM,
 *   Bitcoin et Solana. La classer « TON seulement » ferait disparaître ces
 *   comptes.
 * - Quelle clé TON ? Pour cette même phrase, Tonkeeper applique la dérivation
 *   native, et `resolveTonKey` aussi. Les deux réponses se complètent.
 */
import { validateMnemonic } from '../../crypto/mnemonic';
import { isValidTonMnemonic } from '../chains/ton/tonMnemonic';

export type RecoveryPhraseKind = 'bip39' | 'ton';

export function classifyRecoveryPhrase(phrase: string): RecoveryPhraseKind | null {
  if (validateMnemonic(phrase)) return 'bip39';
  if (isValidTonMnemonic(phrase)) return 'ton';
  return null;
}
