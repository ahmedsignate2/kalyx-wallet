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
 * Essaie `op` sur chaque élément de `items` dans l'ordre, avec un timeout par
 * tentative. Renvoie le premier succès. Si tout échoue, lève RPC_UNAVAILABLE
 * (sans jamais exposer de détail sensible).
 */
export async function tryInOrder<I, T>(
  items: I[],
  op: (item: I) => Promise<T>,
  opts: { timeoutMs: number },
): Promise<T> {
  let lastError: unknown;
  for (const item of items) {
    try {
      return await withTimeout(
        op(item),
        opts.timeoutMs,
        () => new Error('timeout'),
      );
    } catch (e) {
      lastError = e;
    }
  }
  throw new WalletError(
    'RPC_UNAVAILABLE',
    'Réseau indisponible : aucun serveur n\'a répondu. Réessaie.',
  );
}
