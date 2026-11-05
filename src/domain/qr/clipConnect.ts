/**
 * Lien de CONNEXION trouvé dans le presse-papiers : un lien d'appairage
 * WalletConnect v2 (`wc:<topic>@2?…symKey=…`) ou une demande TON Connect.
 *
 * Rien d'autre n'est retenu : une adresse, une phrase, un lien de paiement ne
 * déclenchent jamais de proposition. Le texte n'est ni gardé ni envoyé ; la
 * connexion elle-même passe par les fenêtres habituelles (site, réseaux,
 * demandes), avec « Refuser » par défaut.
 */
import { looksLikeTonConnect } from '../tonconnect/connectLink';

export type ClipConnectLink = { kind: 'walletconnect'; link: string } | { kind: 'tonconnect'; link: string };

/** Au-delà, ce n'est pas un lien de connexion copié (un texte collé entier). */
const MAX_LEN = 4096;

export function clipConnectLink(raw: string | null | undefined): ClipConnectLink | null {
  const s = (raw ?? '').trim();
  if (!s || s.length > MAX_LEN || /\s/.test(s)) return null;
  // Appairage WalletConnect v2 seulement : sujet, version 2 et clé symétrique.
  if (/^wc:[0-9a-f]{64}@2\?/i.test(s) && /[?&]symKey=[0-9a-f]{64}(&|$)/i.test(s)) return { kind: 'walletconnect', link: s };
  if (looksLikeTonConnect(s)) return { kind: 'tonconnect', link: s };
  return null;
}
