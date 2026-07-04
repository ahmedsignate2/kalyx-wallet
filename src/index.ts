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
export { deriveBtcAccount, deriveBtcSigner, btcPath, type BtcAccount, type BtcSigner } from './crypto/btc';
export { BitcoinChainAdapter } from './domain/chains/BitcoinChainAdapter';
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
  checkBtcAddress,
  isValidBtcAddress,
  assertValidBtcAddress,
  type BtcAddressCheck,
} from './domain/validation/btcAddress';
export {
  parseAmount,
  assertSufficientFunds,
  formatAmount,
  formatBalance,
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

// Sécurité : coffre chiffré + politique de PIN
export {
  encryptSecret,
  decryptSecret,
  serializeVault,
  deserializeVault,
  type EncryptedVault,
} from './security/vault';
export {
  checkPin,
  assertValidPin,
  lockRemainingMs,
  isLockedOut,
  PIN_MIN,
  PIN_MAX,
  type PinCheck,
} from './security/pin';

// Prix de marché (CoinGecko)
export {
  getPrices,
  getMarkets,
  getCoinDetail,
  getMarketChart,
  getMarketChartPoints,
  parseMarketChartPoints,
  getTokenPrices,
  searchCoins,
  parseSearchCoins,
  parseSimplePrices,
  parseMarkets,
  parseCoinDetail,
  parseMarketChart,
  parseTokenPrices,
  sortMarkets,
  CHART_PERIODS,
  type CoinPrice,
  type MarketCoin,
  type MarketOrder,
  type CoinDetail,
  type ChartPeriod,
  type ChartPoint,
  type SearchCoin,
} from './domain/prices/coingecko';

// Tokens ERC-20 (Alchemy)
export {
  getErc20Tokens,
  getTokenMetadata,
  getCustomTokens,
  isSpamToken,
  parseTokenBalances,
  parseTokenMetadata,
  type Erc20Token,
  type TokenMeta,
} from './domain/tokens/alchemyTokens';

// NFT (Alchemy)
export { getNfts, parseNfts, type NftItem } from './domain/nft/alchemyNft';

// DeFi / Staking — classification des tokens détenus
export { classifyToken, type DefiKind, type DefiPosition } from './domain/defi/registry';

// Approbations ERC-20 (révocation façon revoke.cash)
export {
  APPROVAL_TOPIC,
  addressTopic,
  addressFromTopic,
  spendersFromLogs,
  isUnlimited,
  revokeCalldata,
  type ApprovalItem,
} from './domain/approvals/approvals';

// Swap / Bridge (LI.FI)
export {
  getSwapQuote,
  parseSwapQuote,
  NATIVE_TOKEN,
  NOVA_FEE,
  NOVA_INTEGRATOR,
  type SwapQuote,
  type QuoteParams,
  type SwapTxRequest,
} from './domain/swap/lifi';

// WalletConnect : décodage lisible des demandes de signature
export {
  hexToText,
  parseSiwe,
  siweDomainMismatch,
  summarizeTypedData,
  type SiweMessage,
  type TypedDataSummary,
} from './domain/wc/message';

// Chaînes (plugins)
export { getAdapter, listChains, hasChain } from './domain/chains/registry';
export { EvmChainAdapter, type RawTxRequest } from './domain/chains/EvmChainAdapter';
export { ALL_CHAINS, ETHEREUM, BNB, POLYGON, BASE, SEPOLIA, BITCOIN } from './domain/chains/configs';
export type {
  ChainAdapter,
  ChainConfig,
  Account,
  Balance,
  TxSummary,
  TransferParams,
  TransferIntent,
  UnsignedTx,
  ChainFamily,
} from './domain/chains/types';
