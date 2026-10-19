/**
 * Erreur rendue à une dApp, au format EIP-1193 / JSON-RPC : un code connu des
 * bibliothèques (ethers, viem, wallet-adapter) et un message court. Jamais de
 * détail interne (pile, chemin, réponse brute d'un nœud au-delà de 300 car.).
 *
 *  4001 refusé · 4100 non autorisé · 4200 non pris en charge · 4900 déconnecté
 *  4902 réseau inconnu · -32002 demande déjà en attente · -32602 paramètres
 *  invalides · -32603 erreur interne
 */
export class RpcError extends Error {
  constructor(
    readonly code: number,
    message: string,
    readonly data?: unknown,
  ) {
    super(message);
  }
}

/** Erreurs à code TEXTE (cœur de Kalyx, ethers) : un message lisible, jamais la réponse brute du nœud. */
const TEXT_CODES: Record<string, string> = {
  INSUFFICIENT_FUNDS: 'Solde insuffisant (frais réseau compris).',
  INSUFFICIENT_GAS: 'Pas assez de monnaie du réseau pour payer les frais.',
  CALL_EXCEPTION: 'Le contrat refuse l’opération : elle échouerait (rien n’a été envoyé).',
  NETWORK_ERROR: 'Réseau injoignable. Réessaie.',
  TIMEOUT: 'Le réseau ne répond pas. Réessaie.',
  SERVER_ERROR: 'Réseau injoignable. Réessaie.',
  RPC_UNAVAILABLE: 'Réseau injoignable. Réessaie.',
  BROADCAST_FAILED: 'Le réseau a refusé la transaction.',
  NONCE_EXPIRED: 'Une autre transaction est partie entre-temps : réessaie.',
  REPLACEMENT_UNDERPRICED: 'Une transaction est déjà en attente : réessaie dans un instant.',
  WRONG_ACCOUNT: 'La clé ne correspond pas au compte affiché.',
  LOCKED: 'Kalyx est verrouillé.',
};

export function toRpcError(e: unknown): { code: number; message: string; data?: unknown } {
  if (e instanceof RpcError) return { code: e.code, message: e.message.slice(0, 300), ...(e.data !== undefined ? { data: e.data } : {}) };
  const textCode = (e as { code?: unknown })?.code;
  if (typeof textCode === 'string') {
    // Erreur du cœur (WalletError) : son message est écrit pour l'utilisateur.
    if ((e as Error)?.name === 'WalletError') return { code: -32603, message: String((e as Error).message).slice(0, 300) };
    return { code: -32603, message: TEXT_CODES[textCode] ?? 'Erreur interne de Kalyx' };
  }
  if ((e as Error)?.message && /fetch|network|timeout|délai|injoignable/i.test((e as Error).message)) return { code: -32603, message: TEXT_CODES.NETWORK_ERROR };
  const c = (e as { code?: unknown })?.code;
  if (typeof c === 'number') return { code: c, message: String((e as Error).message ?? 'Erreur').slice(0, 300), ...((e as { data?: unknown }).data !== undefined ? { data: (e as { data?: unknown }).data } : {}) };
  return { code: -32603, message: 'Erreur interne de Kalyx' };
}
