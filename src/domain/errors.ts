/**
 * Erreurs typées du domaine.
 *
 * On n'expose jamais de détail sensible dans les messages (pas de clé, pas de
 * seed). Chaque erreur porte un `code` stable, utilisable par l'UI pour
 * afficher un message localisé sans se baser sur le texte.
 */
export type WalletErrorCode =
  | 'INVALID_ADDRESS'
  | 'INVALID_AMOUNT'
  | 'AMOUNT_TOO_SMALL'
  | 'INSUFFICIENT_FUNDS'
  | 'INVALID_MNEMONIC'
  | 'MNEMONIC_VERIFICATION_FAILED'
  | 'INVALID_PIN'
  | 'WRONG_PIN'
  | 'VAULT_CORRUPTED'
  | 'RPC_UNAVAILABLE'
  | 'BROADCAST_FAILED'
  | 'CALL_EXCEPTION'
  | 'NOT_SUPPORTED';

export class WalletError extends Error {
  readonly code: WalletErrorCode;

  constructor(code: WalletErrorCode, message: string) {
    super(message);
    this.name = 'WalletError';
    this.code = code;
    // Restaure la chaîne de prototype (cible ES avec transpilation).
    Object.setPrototypeOf(this, WalletError.prototype);
  }
}

/** Garde de type pratique pour les tests et l'UI. */
export function isWalletError(e: unknown): e is WalletError {
  return e instanceof WalletError;
}
