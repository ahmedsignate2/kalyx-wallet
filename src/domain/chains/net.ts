/**
 * Utilitaires réseau : timeout et essai en cascade (fallback) sur plusieurs
 * endpoints. Logique pure (testable), sans dépendance à un provider concret.
 */
import { WalletError } from '../errors';

/** Rejette avec `onTimeout()` si `promise` ne se résout pas en `ms`. */
export function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  onTimeout: () => Error,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(onTimeout()), ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

/**
 * Erreur TRANSITOIRE (propre au serveur RPC) : timeout, coupure réseau, 5xx,
 * rate-limit… → il vaut la peine d'essayer le RPC suivant.
 *
 * À l'inverse, une erreur DÉTERMINISTE (revert de contrat, fonds insuffisants,
 * nonce, gas, argument invalide…) donnera le MÊME résultat sur tous les RPC :
 * inutile d'itérer, et surtout il ne faut pas la masquer derrière un vague
 * « réseau indisponible ». On la relance telle quelle pour que l'appelant
 * (friendlyTxError) affiche le vrai motif (ex. slippage, allocation, solde).
 */
function isTransientRpcError(e: unknown): boolean {
  const err = e as { code?: string | number; shortMessage?: string; message?: string };
  const code = String(err?.code ?? '');
  if (['NETWORK_ERROR', 'SERVER_ERROR', 'TIMEOUT'].includes(code)) return true;
  const msg = (err?.shortMessage || err?.message || '').toLowerCase();
  return /timeout|failed to fetch|fetch failed|network error|could not detect network|econn|socket hang|502|503|504|429|too many requests|rate ?limit|service unavailable|bad gateway|gateway timeout/.test(
    msg,
  );
}

/**
 * Essaie `op` sur chaque élément de `items` dans l'ordre, avec un timeout par
 * tentative. Renvoie le premier succès.
 *
 * - Erreur transitoire d'un RPC → on passe au RPC suivant.
 * - Erreur déterministe (revert, fonds, nonce…) → on la relance immédiatement
 *   (tous les RPC répondraient pareil ; on ne la travestit pas en erreur réseau).
 * - Si tous les RPC échouent de façon transitoire → RPC_UNAVAILABLE.
 */
export async function tryInOrder<I, T>(
  items: I[],
  op: (item: I) => Promise<T>,
  opts: { timeoutMs: number },
): Promise<T> {
  for (const item of items) {
    try {
      return await withTimeout(
        op(item),
        opts.timeoutMs,
        () => new Error('timeout'),
      );
    } catch (e) {
      // Erreur déterministe : inutile d'essayer un autre RPC, on remonte le vrai motif.
      if (!isTransientRpcError(e)) throw e;
      // Sinon (transitoire) : on tente le RPC suivant.
    }
  }
  throw new WalletError(
    'RPC_UNAVAILABLE',
    'Réseau indisponible : aucun serveur n\'a répondu. Réessaie.',
  );
}

/**
 * Réeesaie une promesse `maxRetries` fois avec un délai exponentiel.
 * Par défaut, attend 1000ms, 2000ms, 4000ms.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  baseDelayMs = 1000
): Promise<T> {
  let attempt = 0;
  while (attempt < maxRetries) {
    try {
      return await fn();
    } catch (e) {
      if (!isTransientRpcError(e)) {
        throw e; // Fail fast for deterministic errors
      }
      attempt++;
      if (attempt >= maxRetries) throw e;
      const delay = baseDelayMs * Math.pow(2, attempt - 1);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  return fn(); // Should never reach here, just for TypeScript return type
}
