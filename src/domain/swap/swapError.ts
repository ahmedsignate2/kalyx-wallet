/**
 * Erreurs typées pour le moteur de swap/bridge.
 * Défini dans src/ (domaine pur) pour être importable par l'UI et le moteur.
 */
export type SwapErrorCode =
  | 'AMOUNT_BELOW_MINIMUM'
  | 'NO_LIQUIDITY'
  | 'NO_ROUTE'
  | 'SLIPPAGE_TOO_HIGH'
  | 'INSUFFICIENT_GAS';

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
