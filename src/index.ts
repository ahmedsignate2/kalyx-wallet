/**
 * Point d'entrée public du moteur (couche non-custodial, testée).
 *
 * L'app mobile n'importe QUE d'ici. Elle ne touche jamais aux détails internes
 * ni, surtout, aux clés brutes : le moteur ne renvoie que des données publiques
 * (adresses, soldes, transactions signées).
 */

// Crypto de base
export {
  generateMnemonic,
  validateMnemonic,
  mnemonicToSeed,
  mnemonicToSeedSync,
  entropyToMnemonic,
  type MnemonicStrength,
} from './crypto/mnemonic';
export { deriveEvmAccount, evmPath, type EvmAccount } from './crypto/hd';
export { getRandomBytes } from './crypto/random';

// Erreurs typées
export { WalletError, isWalletError, type WalletErrorCode } from './domain/errors';

// Validation
export {
  checkEvmAddress,
  normalizeEvmAddress,
  isValidEvmAddress,
  type AddressCheck,
} from './domain/validation/address';
export {
  parseAmount,
  assertSufficientFunds,
  formatAmount,
  type ParsedAmount,
} from './domain/validation/amount';

// Sauvegarde de seed
export {
  createBackupChallenge,
  verifyBackupChallenge,
  verifyFullMnemonic,
  type WordChallenge,
  type ChallengeAnswer,
} from './domain/wallet/backupChallenge';

// Chaînes (plugins)
export { getAdapter, listChains, hasChain } from './domain/chains/registry';
export { ALL_CHAINS, ETHEREUM, BNB, POLYGON, SEPOLIA } from './domain/chains/configs';
export type {
  ChainAdapter,
  ChainConfig,
  Account,
  Balance,
  TransferParams,
  TransferIntent,
  UnsignedTx,
  ChainFamily,
} from './domain/chains/types';
