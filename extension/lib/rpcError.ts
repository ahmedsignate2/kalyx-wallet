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

export function toRpcError(e: unknown): { code: number; message: string; data?: unknown } {
  if (e instanceof RpcError) return { code: e.code, message: e.message.slice(0, 300), ...(e.data !== undefined ? { data: e.data } : {}) };
  const c = (e as { code?: unknown })?.code;
  if (typeof c === 'number') return { code: c, message: String((e as Error).message ?? 'Erreur').slice(0, 300), ...((e as { data?: unknown }).data !== undefined ? { data: (e as { data?: unknown }).data } : {}) };
  return { code: -32603, message: 'Erreur interne de Kalyx' };
}
