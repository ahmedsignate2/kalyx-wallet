/**
 * DEMANDES DE SIGNATURE DÉJÀ TRAITÉES (WalletConnect).
 *
 * Après une signature, la fenêtre revenait : en rendant la main à la dApp,
 * l'app passe en arrière-plan ; au retour, le relais WalletConnect REDÉLIVRE
 * la même demande (même identifiant). Rien ne la reconnaissait comme traitée :
 * elle repartait en file et la fenêtre se rouvrait sur une action déjà faite —
 * la réapprouver aurait rediffusé la transaction.
 *
 * On retient donc chaque demande traitée avec la réponse envoyée. Redélivrée,
 * elle n'est plus montrée : la même réponse est renvoyée (utile si la première
 * s'est perdue), sans rien re-signer.
 */

export interface WcResponse {
  id: number;
  jsonrpc: '2.0';
  result?: unknown;
  error?: { code: number; message: string };
}

const MAX = 200;
const handled = new Map<number, { topic: string; response: WcResponse }>();

export function rememberHandledRequest(id: number, topic: string, response: WcResponse): void {
  if (!Number.isFinite(id)) return;
  handled.delete(id);
  handled.set(id, { topic, response });
  // Les plus anciennes sortent : la mémoire reste bornée.
  while (handled.size > MAX) handled.delete(handled.keys().next().value as number);
}

/** Réponse déjà envoyée pour cette demande, si elle a été traitée. */
export function handledResponse(id: number): { topic: string; response: WcResponse } | undefined {
  return handled.get(id);
}

/** Demande expirée (horodatage WalletConnect en secondes) : jamais montrée. */
export function isExpiredRequest(request: { params?: { request?: { expiryTimestamp?: unknown } } } | null | undefined, now = Date.now()): boolean {
  const expiry = Number(request?.params?.request?.expiryTimestamp);
  return Number.isFinite(expiry) && expiry > 0 && now / 1000 > expiry;
}

/** Pour les tests. */
export function resetHandledRequests(): void {
  handled.clear();
}
