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

export async function watchConfirmation(
  chainId: string,
  hash: string,
  label: string,
  hint?: TxWaitHint,
): Promise<void> {
  const adapter = findAdapterV2(chainId);
  if (!adapter) return;

  try {
    const state = await adapter.waitForTx(hash, hint);
    switch (state.status) {
      case 'confirmed':
        notifyAndLog('tx', 'Transaction confirmée ✅', label);
        return;
      case 'failed':
        /*
         * INCLUSE puis rejetée : les frais ont été payés, l'effet attendu n'a
         * pas eu lieu. Le dire autrement qu'« en attente » évite que
         * l'utilisateur attende indéfiniment une confirmation qui ne viendra
         * pas, ou qu'il renvoie en croyant que rien n'est parti.
         */
        notifyAndLog('tx', 'Transaction échouée', `${label} — ${state.reason ?? 'rejetée par le réseau.'}`);
        return;
      case 'expired':
        // JAMAIS incluse : les fonds n'ont pas bougé, et on peut réessayer.
        notifyAndLog('tx', 'Transaction abandonnée', `${label} — les fonds n'ont pas bougé, tu peux réessayer.`);
        return;
      default:
        notifyAndLog('tx', 'Confirmation en attente', `${label} — vérifie l'explorateur si ça traîne.`);
    }
  } catch {
    notifyAndLog('tx', 'Confirmation en attente', `${label} — vérifie l'explorateur si ça traîne.`);
  }
}
