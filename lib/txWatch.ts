/**
 * Suivi de confirmation d'une transaction : après l'envoi, on attend qu'elle
 * soit MINÉE (waitForTx) puis on notifie « confirmée / non confirmée ». En
 * tâche de fond (fire-and-forget) : ne bloque pas l'UI.
 *
 * Limite v1 : ne suit que les chaînes EVM (Bitcoin = pas de waitForTx) ; le
 * suivi s'arrête si l'app passe en arrière-plan prolongé (le vrai suivi hors-
 * ligne nécessiterait du push serveur).
 */
import { getAdapter, EvmChainAdapter } from '../src';
import { notifyAndLog } from './notificationCenter';

export async function watchConfirmation(chainId: string, hash: string, label: string): Promise<void> {
  const adapter = getAdapter(chainId);
  if (!(adapter instanceof EvmChainAdapter)) return; // Bitcoin : suivi non géré (v1)
  try {
    await adapter.waitForTx(hash);
    notifyAndLog('tx', 'Transaction confirmée ✅', label);
  } catch {
    notifyAndLog('tx', 'Confirmation en attente', `${label} — vérifie l'explorateur si ça traîne.`);
  }
}
