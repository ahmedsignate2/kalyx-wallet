/**
 * Traduit une erreur de transaction (ethers/RPC) en message clair pour
 * l'utilisateur — au lieu d'un vague « erreur réseau ».
 */
import { isWalletError } from '../src';

export function friendlyTxError(e: unknown): string {
  if (isWalletError(e)) {
    if (e.code === 'WRONG_PIN') return 'PIN incorrect.';
    if (e.code === 'RPC_UNAVAILABLE') return 'Réseau indisponible. Réessaie.';
    return e.message;
  }
  const err = e as { code?: string | number; shortMessage?: string; info?: { error?: { message?: string } }; message?: string };
  const msg = (err?.info?.error?.message || err?.shortMessage || err?.message || '').toLowerCase();

  if (err?.code === 'INSUFFICIENT_FUNDS' || msg.includes('insufficient funds') || msg.includes('insufficient balance')) {
    return 'Solde insuffisant pour couvrir le montant et les frais de réseau.';
  }
  if (msg.includes('user rejected') || msg.includes('rejected')) return 'Transaction annulée.';
  if (msg.includes('nonce')) return 'Conflit de transaction (nonce). Réessaie dans un instant.';
  if (msg.includes('replacement') || msg.includes('underpriced')) return 'Frais trop bas ou transaction en double. Réessaie.';
  if (msg.includes('slippage') || msg.includes('min return') || msg.includes('too little received')) {
    return 'Le prix a bougé (slippage). Redemande un devis.';
  }
  if (err?.code === 'CALL_EXCEPTION' || msg.includes('execution reverted')) {
    return 'La transaction a échoué (contrat). Vérifie le montant ou l’allocation.';
  }
  if (msg.includes('timeout') || msg.includes('network') || msg.includes('failed to fetch')) {
    return 'Réseau indisponible. Vérifie ta connexion et réessaie.';
  }
  return 'La transaction a échoué. Réessaie.';
}
