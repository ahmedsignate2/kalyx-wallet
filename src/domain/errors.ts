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
  /** Tentative d'exécuter le flux de PREMIER lancement alors qu'un wallet existe. */
  | 'WALLET_ALREADY_EXISTS'
  /** L'utilisateur a refusé ou annulé la demande biométrique du système. */
  | 'BIOMETRIC_REFUSED'
  /** Aucun coffre biométrique pour ce wallet (jamais activé, ou invalidé). */
  | 'BIOMETRIC_NOT_SET'
  | 'RPC_UNAVAILABLE'
  | 'BROADCAST_FAILED'
  | 'CALL_EXCEPTION'
  /** La chaîne a inclus la transaction mais son exécution a échoué. */
  | 'TX_FAILED'
  /**
   * Transaction jamais incluse : sur Solana, un blockhash périmé la rend
   * définitivement inutilisable. À distinguer de `BROADCAST_FAILED`, qui dit
   * que le réseau a refusé de la prendre — ici il l'a prise, puis abandonnée.
   * Dans les deux cas les fonds n'ont pas bougé, et c'est ce qu'il faut dire.
   */
  | 'TX_EXPIRED'
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
