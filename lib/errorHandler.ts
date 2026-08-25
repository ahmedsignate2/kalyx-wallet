import { toast } from './toast';

/**
 * Traduit les erreurs brutes communes en messages UI en français.
 * Utilisé pour les popups (toast) suite à des échecs réseau/RPC ou utilisateurs.
 */
export function handleSmartError(e: unknown) {
  console.error('[SmartError]', e);
  const msg = (e instanceof Error ? e.message : String(e)).toLowerCase();
  
  if (msg.includes('user rejected') || msg.includes('user canceled') || msg.includes('rejected by user')) {
    toast.error('Demande annulée', 'L\'action a été annulée.');
  } else if (msg.includes('insufficient funds') || msg.includes('balance too low')) {
    toast.error('Solde insuffisant', 'Solde insuffisant pour payer les frais.');
  } else if (msg.includes('network error') || msg.includes('timeout') || msg.includes('failed to fetch')) {
    toast.error('Erreur réseau', 'Veuillez vérifier votre connexion.');
  } else if (msg.includes('nonce too low') || msg.includes('replacement transaction underpriced')) {
    toast.error('Erreur de transaction', 'La transaction est obsolète (nonce trop bas).');
  } else {
    // Message générique ou fallback
    toast.error('Erreur', 'Une erreur est survenue.');
  }
}
