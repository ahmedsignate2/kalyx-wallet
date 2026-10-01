/**
 * Suivi de confirmation d'une transaction : après l'envoi, on attend son issue
 * puis on notifie. En tâche de fond (fire-and-forget) : ne bloque pas l'UI.
 *
 * TROU COMBLÉ. Ce module ne suivait que les chaînes EVM — « Bitcoin : suivi non
 * géré » — parce que l'interface v1 n'avait de `waitForTx` que sur l'EVM. Un
 * envoi Bitcoin ou Solana n'était donc jamais confirmé : l'utilisateur voyait
 * « envoyé » et plus rien ensuite, quoi qu'il arrive à sa transaction. La v2
 * rend `waitForTx` obligatoire sur les trois, et distingue les issues.
 *
 * Reste vrai : le suivi s'arrête si l'app passe en arrière-plan prolongé. Un
 * vrai suivi hors-ligne demanderait du push serveur.
 */
import { findAdapterV2, type TxWaitHint } from '../src';
import { notifyAndLog } from './notificationCenter';
import { fill, translate, type Key } from './i18n';
import { useSettings } from './settingsStore';

/*
 * DANS LA LANGUE DE L'UTILISATEUR, lue au moment d'envoyer. Ces notifications
 * étaient en français en dur, pour tout le monde. Le motif d'échec renvoyé par
 * le réseau (souvent en français lui aussi) n'est plus recopié : le texte
 * traduit dit l'essentiel — c'est rejeté, et les frais sont payés.
 */
const tr = (key: Key, label?: string) => fill(translate(useSettings.getState().language, key), { label: label ?? '' });

/** Issue connue (confirmed/failed/expired) ou non (pending : délai dépassé ; unknown : illisible). */
export type TxOutcome = 'confirmed' | 'failed' | 'expired' | 'pending' | 'unknown';

export async function watchConfirmation(
  chainId: string,
  hash: string,
  label: string,
  hint?: TxWaitHint,
): Promise<TxOutcome> {
  const adapter = findAdapterV2(chainId);
  if (!adapter) return 'unknown';

  try {
    const state = await adapter.waitForTx(hash, hint);
    switch (state.status) {
      case 'confirmed':
        notifyAndLog('tx', tr('notifTxConfirmedTitle'), label);
        return 'confirmed';
      case 'failed':
        /*
         * INCLUSE puis rejetée : les frais ont été payés, l'effet attendu n'a
         * pas eu lieu. Le dire autrement qu'« en attente » évite que
         * l'utilisateur attende indéfiniment une confirmation qui ne viendra
         * pas, ou qu'il renvoie en croyant que rien n'est parti.
         */
        notifyAndLog('tx', tr('notifTxFailedTitle'), tr('notifTxFailedBody', label));
        return 'failed';
      case 'expired':
        // JAMAIS incluse : les fonds n'ont pas bougé, et on peut réessayer.
        notifyAndLog('tx', tr('notifTxExpiredTitle'), tr('notifTxExpiredBody', label));
        return 'expired';
      default:
        notifyAndLog('tx', tr('notifTxPendingTitle'), tr('notifTxPendingBody', label));
        return 'pending';
    }
  } catch {
    notifyAndLog('tx', tr('notifTxPendingTitle'), tr('notifTxPendingBody', label));
    return 'unknown';
  }
}
