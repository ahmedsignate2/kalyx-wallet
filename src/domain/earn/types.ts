/**
 * Earn — types du moteur (stake / unstake / lend / withdraw).
 *
 * Deux familles de protocoles :
 * - `staking`  : staking liquide (ETH → stETH, SOL → JitoSOL…). Le token de
 *   rendement est un actif à part entière dont le prix suit le sous-jacent.
 * - `lending`  : dépôt sur un marché de prêt (Aave v3). Le token reçu (aToken)
 *   vaut 1:1 le sous-jacent et grossit avec les intérêts.
 *
 * Chaque protocole déclare COMMENT on entre et on sort :
 * - `contract` : appel direct du contrat du protocole (0 frais, 0 slippage).
 * - `lifi`     : swap via LI.FI (utile pour sortir instantanément d'un staking
 *   liquide dont le retrait natif prend des jours — c'est un swap, avec slippage).
 */

export type EarnKind = 'staking' | 'lending';
export type EarnAction = 'deposit' | 'withdraw';

/** Mode d'exécution d'une action. */
export type EarnRoute =
  | { via: 'contract' }
  | { via: 'lifi' }
  | { via: 'none'; reason: string };

export interface EarnToken {
  /** Adresse du contrat (EVM) ou mint (Solana). `NATIVE` pour la monnaie native. */
  address: string;
  symbol: string;
  decimals: number;
  /** Id CoinGecko pour la valorisation fiat. */
  coingeckoId?: string;
}

export interface EarnProtocol {
  /** Id stable (clé du catalogue). */
  id: string;
  kind: EarnKind;
  /** Nom affiché du protocole (Lido, Aave v3…). */
  name: string;
  /** Id Kalyx de la chaîne ('ethereum', 'solana', 'avalanche'…). */
  chainId: string;
  /** Ce que l'utilisateur dépose. */
  underlying: EarnToken;
  /** Ce qu'il reçoit (stETH, aEthUSDC…). Détecter une position = solde > 0 de ce token. */
  receipt: EarnToken;
  deposit: EarnRoute;
  withdraw: EarnRoute;
  /** Source de l'APY. */
  apy:
    | { source: 'defillama'; pool: string }
    | { source: 'aave-v3'; pool: string }
    | { source: 'fixed'; value: number };
  /** URL du logo (repli lettré côté UI si indisponible). */
  logo: string;
  /** Site officiel (info / repli). */
  url: string;
  /**
   * Adresse du contrat cible pour les appels directs (Pool Aave, contrat Lido…).
   * Absent quand toutes les routes passent par LI.FI.
   */
  contract?: string;
  /** Texte court expliquant la sortie (délai natif, swap instantané…). */
  withdrawNote?: string;
}

/** Position détectée pour un compte. */
export interface EarnPosition {
  protocolId: string;
  /** Solde brut du token de reçu (stETH, aUSDC…). */
  balance: bigint;
  /** Décimales du token de reçu. */
  decimals: number;
}

/** Transaction prête à signer (agnostique du signataire). */
export type EarnTx =
  | { type: 'evm'; to: string; data: string; value: bigint; chainId: number; gasLimit?: bigint }
  | { type: 'solana'; data: string };

export interface EarnQuote {
  protocolId: string;
  action: EarnAction;
  /** Montant déposé/retiré (unité brute du token d'entrée). */
  amountIn: bigint;
  tokenIn: EarnToken;
  /** Montant attendu en sortie (unité brute du token de sortie). */
  amountOut: bigint;
  tokenOut: EarnToken;
  /** Spender à approuver avant la tx (ERC-20 uniquement), sinon null. */
  approvalAddress: string | null;
  /** Gas estimé en monnaie native (unité brute) — 0n si inconnu. */
  gasNative: bigint;
  /** Gas estimé en USD — 0 si inconnu. */
  gasUsd: number;
  /** Frais de route en USD (LI.FI) — 0 pour un appel direct. */
  feeUsd: number;
  /** Description de la route (« Contrat Lido », « Jupiter via LI.FI »…). */
  routeLabel: string;
  tx: EarnTx;
}
