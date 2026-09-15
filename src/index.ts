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
export { deriveEvmAccount, evmPath, evmAccountFromPrivateKey, normalizeEvmPrivateKey, type EvmAccount } from './crypto/hd';
export { deriveBtcAccount, deriveBtcSigner, btcPath, type BtcAccount, type BtcSigner } from './crypto/btc';
export {
  deriveSolanaAccount,
  deriveSolanaSigner,
  isValidSolanaAddress,
  solPath,
  type SolAccount,
  type SolSigner,
} from './crypto/solana';
export { BitcoinChainAdapter } from './domain/chains/BitcoinChainAdapter';
export { SolanaChainAdapter } from './domain/chains/SolanaChainAdapter';
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
// Formatage lisible (précision selon la grandeur) — LA règle d'affichage des montants
export { formatTokenAmount, formatNumber, formatInputAmount, formatFiat, formatPercent, formatDecimalString, setNumberLocale, decimalSeparator } from './domain/validation/format';

// Sauvegarde de seed
export {
  createBackupChallenge,
  verifyBackupChallenge,
  verifyFullMnemonic,
  type WordChallenge,
  type ChallengeAnswer, unknownWords } from './domain/wallet/backupChallenge';

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
export { erc20TransferData } from './domain/tokens/transfer';
export { knownTokensFor, KNOWN_ERC20_BY_CHAIN } from './domain/tokens/knownTokens';
// Décodage local d'une transaction avant signature (mini-simulation)
export { decodeTx, isRiskyTx, type DecodedTx } from './domain/tx/decodeTx';
// Alertes de prix (logique de déclenchement)
export { alertTriggered, type PriceAlert } from './domain/alerts/priceAlerts';
// Export CSV des transactions
export { transactionsToCsv, type CsvContext } from './domain/export/txCsv';
// Export manuel chiffré de la seed
export { createBackup, restoreBackup, BACKUP_VERSION, type BackupEnvelope } from './domain/backup/cloudBackup';
export {
  parseTokenAccounts,
  KNOWN_MINTS,
  SPL_TOKEN_PROGRAM,
  type SplToken,
} from './domain/tokens/splTokens';

// QR — analyse du contenu scanné (adresses, URIs de paiement, wc:, URL)
export { parseQr, type QrResult } from './domain/qr/parse';
export {
  qrTargetFamily,
  kalyxChainIdForEvm,
  describeQr,
  type QrFamily,
  type QrDescription,
} from './domain/qr/route';

// NFT (Alchemy)
export { getNfts, parseNfts, type NftItem } from './domain/nft/alchemyNft';
export { getSolanaNfts } from './domain/nft/solanaNft';

// Réserve de gas dynamique (swap/bridge/dépôt), estimée sur le RPC de chaque réseau
export { estimateGasReserve, evmReserveFromFeeData, solanaReserveFromPriorityFees, SWAP_GAS_UNITS, SOL_BASE_FEE, type GasReserve } from './domain/chains/gasReserve';

// Anti-empoisonnement d'adresse + formats lisibles
export { detectPoisoning, groupAddress, shortAddress, type PoisoningMatch } from './domain/validation/poisoning';

// Signature expliquée (§4.7) : simulation + explication humaine + niveau de risque
export { simulateTx, staticSimulation, parseAlchemySimulation, type Simulation, type AssetChange } from './domain/tx/simulate';
export { explainRequest, type SignExplanation, type SignRisk, type ExplainInput } from './domain/wc/explain';
export { describeSolanaTransaction, KNOWN_SOLANA_PROGRAMS, type SolanaTxDescription } from './domain/wc/solanaTx';

// Activité humanisée (§4.6)
export { humanizeTx, groupByDay, type HumanTx, type HumanizeCtx, type TxGroup } from './domain/tx/humanize';

// Glyphe d'adresse (étoile unique par adresse, vérification visuelle)
export { glyphFor, starPath, GLYPH_PALETTE, type AddressGlyphSpec } from './domain/wallet/glyph';

// Earn — moteur stake / lend (catalogue vérifié, encodeurs ABI, APY)
export * from './domain/earn';

// DeFi / Staking — classification des tokens détenus
export { classifyToken, type DefiKind, type DefiPosition } from './domain/defi/registry';

// ENS — résolution de noms Ethereum (forward / reverse / avatar)
export {
  looksLikeEnsName,
  resolveEnsName,
  lookupEnsName,
  resolveEnsAvatar,
  type EnsProvider,
} from './domain/ens/ens';

// GoPlus Security — détection de risques avant signature
export {
  assessAddress,
  assessToken,
  isPhishingSite,
  parseAddressSecurity,
  parseTokenSecurity,
  parsePhishingSite,
  type RiskAssessment,
  type RiskLevel,
} from './domain/security/goplus';

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
  getSwapQuote as getLifiQuote,
  parseSwapQuote,
  NATIVE_TOKEN,
  KALYX_FEE,
  KALYX_INTEGRATOR,
  type SwapQuote,
  type QuoteParams,
  type SwapTxRequest,
} from './domain/swap/lifi';
export { SwapError, type SwapErrorCode } from './domain/swap/swapError';
export { getRelayQuote } from './domain/swap/relay';
export { getBestQuote } from './domain/swap/index';

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
export { getAdapter, listChains, hasChain, registerChain, unregisterChain } from './domain/chains/registry';
export { chainIconUrl } from './domain/chains/icons';
export { EvmChainAdapter, type RawTxRequest } from './domain/chains/EvmChainAdapter';
export { computeFeeTiers, type FeeOptions, type FeeTier, type FeeSpeed } from './domain/chains/gas';
export { ALL_CHAINS, ETHEREUM, BNB, POLYGON, BASE, SEPOLIA, BASE_SEPOLIA, BITCOIN, SOLANA, SOLANA_DEVNET, buildExplorerTxUrl } from './domain/chains/configs';
// Sauvegarde portable des réseaux EVM personnalisés (export/import)
export { serializeNetworks, parseNetworksBackup, NETWORKS_BACKUP_VERSION } from './domain/chains/customNetworks';
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

// Anti-Drainer Security & Simulation
export {
  simulateSendTransaction,
  simulateEvmTransaction,
  simulateSolanaTransaction,
  checkEvmAddressReputation,
  checkSolanaAddressReputation,
  type SimulationResult,
} from './services/security/simulationService';

// EVM Transaction Replacement (Speed Up / Cancel)
export {
  calculateReplacementGas,
  buildSpeedUpTx,
  buildCancelTx,
  fetchOriginalEvmTx,
  executeReplacement,
  type GasParams,
  type CalculatedReplacementGas,
  type OriginalEvmTx,
} from './services/transactions/replacementService';


