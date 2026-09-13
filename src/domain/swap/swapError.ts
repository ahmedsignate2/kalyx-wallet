/**
 * Erreurs typées du moteur de swap/bridge — défini dans src/ (domaine pur)
 * pour être partagé par les providers, le routeur et l'UI.
 *
 * Chaque code correspond à UN message clair côté utilisateur (lib/txError.ts).
 * `meta` porte les détails utiles (min/max, symbole, provider…).
 */
export type SwapErrorCode =
  | 'AMOUNT_BELOW_MINIMUM'
  | 'AMOUNT_ABOVE_MAXIMUM'
  | 'NO_LIQUIDITY'
  | 'NO_ROUTE'
  | 'INVALID_TOKEN'
  | 'INVALID_ADDRESS'
  | 'SLIPPAGE_TOO_HIGH'
  | 'INSUFFICIENT_GAS'
  | 'INSUFFICIENT_FUNDS'
  | 'RATE_LIMITED'
  | 'NETWORK'
  | 'QUOTE_EXPIRED'
  | 'PROVIDER_UNAVAILABLE';

export class SwapError extends Error {
  constructor(
    public readonly code: SwapErrorCode,
    message: string,
    public readonly meta?: Record<string, string>,
  ) {
    super(message);
    this.name = 'SwapError';
  }
}

/**
 * Priorité d'affichage quand plusieurs providers échouent : on montre l'erreur
 * la plus ACTIONNABLE (un minimum précis vaut mieux qu'un « aucune route »).
 */
const PRIORITY: SwapErrorCode[] = [
  'INVALID_ADDRESS',
  'INVALID_TOKEN',
  'AMOUNT_BELOW_MINIMUM',
  'AMOUNT_ABOVE_MAXIMUM',
  'INSUFFICIENT_FUNDS',
  'INSUFFICIENT_GAS',
  'SLIPPAGE_TOO_HIGH',
  'NO_LIQUIDITY',
  'RATE_LIMITED',
  'NETWORK',
  'QUOTE_EXPIRED',
  'PROVIDER_UNAVAILABLE',
  'NO_ROUTE',
];

export function pickMostRelevant(errors: SwapError[]): SwapError | null {
  if (errors.length === 0) return null;
  return [...errors].sort((a, b) => PRIORITY.indexOf(a.code) - PRIORITY.indexOf(b.code))[0];
}
