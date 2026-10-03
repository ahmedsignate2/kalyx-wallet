/**
 * Erreurs d'une demande au téléphone (tableau de bord web), en phrases :
 * les CODES levés par lib/webConnect sont traduits ici, tout le reste passe
 * par l'entonnoir commun (`friendlyTxError`). Afficher « Transaction échouée »
 * pour une session perdue faisait réessayer en vain ; afficher le code brut
 * (« REQUEST_EXPIRED ») n'apprenait rien.
 */
import { friendlyTxError } from '../../lib/txError';
import type { WebKey } from './webI18n';

const CODES: Record<string, WebKey> = {
  REQUEST_EXPIRED: 'signExpired',
  NOT_CONNECTED: 'webNotConnected',
  SESSION_LOST: 'webSessionLost',
};

/** Clé web d'un code de lib/webConnect, ou null. */
export function webErrorKey(e: unknown): WebKey | null {
  const m = e instanceof Error ? e.message : typeof e === 'string' ? e : '';
  return CODES[m] ?? null;
}

export function webErrorText(e: unknown, tw: (k: WebKey) => string, t: (k: never) => string): string {
  const key = webErrorKey(e);
  return key ? tw(key) : friendlyTxError(e, t as never);
}
