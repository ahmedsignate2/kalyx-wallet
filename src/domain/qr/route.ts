/**
 * Routage d'un résultat QR (pur, testable) : famille de chaîne cible, résolution
 * de la chaîne EVM par chainId, et description lisible pour l'écran de
 * confirmation. AUCUNE navigation ni exécution ici — l'UI décide après accord.
 */
import type { QrResult } from './parse';

export type QrFamily = 'evm' | 'bitcoin' | 'solana';

/** Famille de chaîne requise pour agir sur ce QR (null si non transactionnel). */
export function qrTargetFamily(result: QrResult): QrFamily | null {
  switch (result.kind) {
    case 'evm-address':
    case 'ethereum-uri':
      return 'evm';
    case 'bitcoin-address':
    case 'bitcoin-uri':
      return 'bitcoin';
    case 'solana-address':
    case 'solana-uri':
      return 'solana';
    default:
      return null;
  }
}

/** Id de chaîne Kalyx correspondant à un chainId EVM (ou null si inconnu). */
export function kalyxChainIdForEvm(
  chainId: number | undefined,
  chains: { id: string; evmChainId?: number }[],
): string | null {
  if (!chainId) return null;
  return chains.find((c) => c.evmChainId === chainId)?.id ?? null;
}

export interface QrDescription {
  /** Titre court (type d'intention). */
  title: string;
  /** Détail affiché (adresse, URL, montant) — TOUJOURS montré avant d'agir. */
  detail: string;
  /** Libellé du bouton d'action, ou null si aucune action possible. */
  cta: string | null;
  /** true = demande une vigilance particulière (lien externe, invalide). */
  danger: boolean;
}

/** Résumé lisible de ce qui a été scanné (sécurité : on montre toujours). */
export function describeQr(result: QrResult): QrDescription {
  switch (result.kind) {
    case 'evm-address':
      return { title: 'Adresse EVM', detail: result.address, cta: 'Envoyer', danger: false };
    case 'solana-address':
      return { title: 'Adresse Solana', detail: result.address, cta: 'Envoyer', danger: false };
    case 'bitcoin-address':
      return { title: 'Adresse Bitcoin', detail: result.address, cta: 'Envoyer', danger: false };
    case 'ethereum-uri':
      return {
        title: 'Paiement EVM',
        detail: result.amount ? `${result.address}\nMontant : ${result.amount} ETH` : result.address,
        cta: 'Continuer',
        danger: false,
      };
    case 'bitcoin-uri':
      return {
        title: 'Paiement Bitcoin',
        detail: result.amount ? `${result.address}\nMontant : ${result.amount} BTC` : result.address,
        cta: 'Continuer',
        danger: false,
      };
    case 'solana-uri':
      return {
        title: result.splToken ? 'Paiement token SPL' : 'Paiement Solana',
        detail: result.amount ? `${result.address}\nMontant : ${result.amount}` : result.address,
        cta: 'Continuer',
        danger: false,
      };
    case 'walletconnect':
      return { title: 'Connexion dApp', detail: 'WalletConnect — demande de connexion', cta: 'Connecter', danger: false };
    case 'url':
      return { title: 'Ouvrir ce site ?', detail: result.url, cta: 'Ouvrir dans le navigateur', danger: true };
    case 'invalid':
      return {
        title: 'QR non reconnu',
        detail: result.raw ? result.raw.slice(0, 80) : '(vide)',
        cta: null,
        danger: true,
      };
  }
}
