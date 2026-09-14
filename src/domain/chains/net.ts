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
  opts: { timeoutMs: number; /** Clé de mémoire de santé (ex. l'id de chaîne) : les RPC en panne passent en dernier. */ key?: string },
): Promise<T> {
  const order = opts.key ? orderByHealth(opts.key, items.length) : items.map((_, i) => i);
  for (const i of order) {
    const item = items[i];
    try {
      const res = await withTimeout(
        op(item),
        opts.timeoutMs,
        () => new Error('timeout'),
      );
      if (opts.key) markHealthy(opts.key, i);
      return res;
    } catch (e) {
      // Erreur déterministe : inutile d'essayer un autre RPC, on remonte le vrai motif.
      if (!isTransientRpcError(e)) throw e;
      // Sinon (transitoire) : on retient la panne et on tente le RPC suivant.
      if (opts.key) markFailed(opts.key, i);
    }
  }
  throw new WalletError(
    'RPC_UNAVAILABLE',
    'Réseau indisponible : aucun serveur n\'a répondu. Réessaie.',
  );
}

/* ------------------------------------------------------------------ */
/* Mémoire de santé des RPC                                            */
/* ------------------------------------------------------------------ */

/**
 * Un RPC qui vient d'échouer n'est pas réessayé en premier pendant COOLDOWN :
 * sans ça, chaque appel attendait le timeout complet du RPC en panne avant de
 * basculer (8 s de latence à chaque solde). Le dernier RPC qui a répondu passe
 * en tête. Mémoire en RAM, par clé (id de chaîne).
 */
const RPC_COOLDOWN_MS = 60_000;
const failedAt = new Map<string, number>();
const lastGood = new Map<string, number>();

function orderByHealth(key: string, count: number): number[] {
  const now = Date.now();
  const idx = Array.from({ length: count }, (_, i) => i);
  const good = lastGood.get(key);
  const penalty = (i: number) => {
    const t = failedAt.get(`${key}:${i}`);
    return t !== undefined && now - t < RPC_COOLDOWN_MS ? 1 : 0;
  };
  // Tri stable : d'abord les sains (dernier bon en tête), puis ceux en pénalité.
  return idx.sort((a, b) => penalty(a) - penalty(b) || (a === good ? -1 : b === good ? 1 : a - b));
}

function markFailed(key: string, i: number): void {
  failedAt.set(`${key}:${i}`, Date.now());
  if (lastGood.get(key) === i) lastGood.delete(key);
}

function markHealthy(key: string, i: number): void {
  failedAt.delete(`${key}:${i}`);
  lastGood.set(key, i);
}

/** Tests : oublier la mémoire de santé. */
export function resetRpcHealth(): void {
  failedAt.clear();
  lastGood.clear();
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
