/**
 * Architecture de plugins multi-chaînes.
 *
 * Chaque blockchain est un module indépendant qui implémente `ChainAdapter`.
 * Ajouter un réseau EVM (Base, Arbitrum, Avalanche…) = une entrée de config.
 * Ajouter une chaîne non-EVM (Bitcoin, Solana) = un nouvel adapter, sans
 * modifier le reste du wallet.
 *
 * Règle de sécurité : un adapter ne STOCKE jamais de clé privée. La clé est
 * passée en paramètre au moment de signer, puis remise à zéro par l'appelant.
 */

export type ChainFamily = 'evm' | 'bitcoin' | 'solana';

export interface ChainConfig {
  /** Identifiant interne stable ('ethereum', 'bnb', 'polygon', 'sepolia'). */
  id: string;
  name: string;
  family: ChainFamily;
  /** chainId EVM (numérique) ; ignoré pour les familles non-EVM. */
  evmChainId?: number;
  /** Clé d'identification pour l'API LI.FI (ex: "1" pour Ethereum, "SOL" pour Solana). */
  lifiKey?: string;
  /** Clé d'identification pour l'API Relay (souvent équivalente, ex: "1", "solana"). */
  relayId?: string;
  nativeSymbol: string;
  nativeDecimals: number;
  rpcUrls: string[];
  explorerUrl?: string;
  /**
   * API explorateur compatible Etherscan (txlist), en REPLI quand l'API Etherscan V2
   * ne couvre pas ce réseau sur le plan gratuit (ex. Base, Optimism → « Free API access
   * is not supported for this chain »). Base URL SANS query, ex. `https://base.blockscout.com/api`.
   */
  explorerApi?: string;
  testnet?: boolean;
  /** Id CoinGecko de la monnaie native (pour le prix fiat). Absent = testnet. */
  coingeckoId?: string;
  /** Plateforme CoinGecko (pour le prix des tokens ERC-20 par contrat). */
  coingeckoPlatform?: string;
}

/** Données publiques d'un compte — jamais de clé privée ici. */
export interface Account {
  chain: string;
  address: string;
  index: number;
  path: string;
}

export interface Balance {
  raw: bigint;
  decimals: number;
  symbol: string;
}

export interface TxSummary {
  hash: string;
  from: string;
  to: string;
  value: bigint; // plus petite unité (wei)
  timestamp: number; // unix (secondes)
  direction: 'in' | 'out' | 'self';
  status: 'success' | 'failed';
  type?: string;
  asset?: string;
  decimals?: number; // e.g. "SWAP", "TRANSFER", "NFT"
  description?: string; // Texte lisible fourni par l'indexeur (ex: Helius)
}

export interface TransferParams {
  to: string;
  /** Montant en chaîne décimale saisi par l'utilisateur ("0.5"). */
  amount: string;
}

/** Intention de transfert validée, hors frais/nonce (100 % hors-ligne). */
export interface TransferIntent {
  to: string;
  value: bigint;
  evmChainId: number;
}

/** Transaction complète prête à signer (frais et nonce renseignés). */
export interface UnsignedTx extends TransferIntent {
  nonce: number;
  gasLimit: bigint;
  maxFeePerGas: bigint;
  maxPriorityFeePerGas: bigint;
}

export interface ChainAdapter {
  readonly config: ChainConfig;

  /** Dérive le compte #index (données publiques uniquement). */
  deriveAccount(seed: Uint8Array, index?: number): Account;

  /** Solde natif (réseau). */
  getBalance(address: string): Promise<Balance>;

  /** Historique des transfers natifs (réseau). Liste vide si indispo. */
  getHistory(address: string): Promise<TxSummary[]>;

  /** Construit + valide une intention de transfert (hors-ligne). */
  buildTransfer(params: TransferParams): TransferIntent;

  /** Complète l'intention avec nonce + frais estimés (réseau). */
  prepareTransfer(
    from: string,
    params: TransferParams,
    /** Frais EIP-1559 imposés (palier utilisateur) ; sinon suggestion réseau. */
    gas?: { maxFeePerGas: bigint; maxPriorityFeePerGas: bigint },
  ): Promise<UnsignedTx>;

  /** Signe hors-ligne. `privateKey` transite, n'est jamais stockée. */
  signTransaction(tx: UnsignedTx, privateKey: string): Promise<string>;

  /** Diffuse la transaction signée, renvoie le hash (réseau). */
  broadcast(rawSignedTx: string): Promise<string>;
}
