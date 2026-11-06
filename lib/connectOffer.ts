/**
 * Proposition de connexion (lien WalletConnect / TON Connect repéré) : une
 * seule à la fois, affichée par ui/ConnectOfferSheet. Remplace les boîtes
 * Android génériques.
 */
import { create } from 'zustand';

export interface ConnectOffer {
  kind: 'walletconnect' | 'tonconnect';
  /** Site qui affiche le lien (navigateur intégré) ; absent pour un lien copié. */
  site?: string;
  onConnect: () => void;
  onIgnore?: () => void;
}

export const useConnectOffer = create<{ offer: ConnectOffer | null }>(() => ({ offer: null }));

export function offerConnect(offer: ConnectOffer): void {
  useConnectOffer.setState({ offer });
}

/** Ferme la proposition : `connect` vrai = accepter, sinon ignorer. */
export function answerConnectOffer(connect: boolean): void {
  const o = useConnectOffer.getState().offer;
  useConnectOffer.setState({ offer: null });
  if (!o) return;
  if (connect) o.onConnect();
  else o.onIgnore?.();
}
