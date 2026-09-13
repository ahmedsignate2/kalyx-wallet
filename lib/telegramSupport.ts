import { Linking } from 'react-native';
import { detectSensitiveSecrets } from './secretDetector';

export interface SupportTicketParams {
  problem: string;
  network?: string;
  detectedError?: string;
  targetAmount?: string;
  userDescription?: string;
  recentLogs?: string;
}

/**
 * Construit un contenu de ticket formaté selon le modèle standard du support Nova/Kalyx.
 */
export function buildSupportTicketContent(params: SupportTicketParams): string {
  const problem = params.problem || 'Problème technique non résolu';
  const network = params.network || 'Non spécifié';
  const detectedError = params.detectedError || 'Non déterminée';
  const targetAmount = params.targetAmount || 'N/A';
  const userDescription = params.userDescription || 'Demande d\'assistance via le Copilot';
  const recentLogs = params.recentLogs || 'Aucun log technique récent';

  return (
    `🎫 [TICKET SUPPORT NOVA]\n` +
    `• Problème : ${problem}\n` +
    `• Réseau : ${network}\n` +
    `• Erreur détectée : ${detectedError}\n` +
    `• Montant visé : ${targetAmount}\n` +
    `• Description utilisateur : "${userDescription}"\n` +
    `• Logs récents :\n` +
    `${recentLogs}`
  );
}

/**
 * Ouvre la discussion Telegram officielle avec le message pré-rempli.
 * Effectue un contrôle ultime : si un secret sensible est détecté, l'envoi est bloqué.
 */
export const openTelegramTicket = async (ticketContent: string): Promise<boolean> => {
  // Vérification de sécurité absolue avant ouverture
  const check = detectSensitiveSecrets(ticketContent);
  if (check.hasSecret) {
    throw new Error(check.warningMessage || 'Présence de données sensibles détectée dans le ticket.');
  }

  const encodedText = encodeURIComponent(ticketContent);
  // Ouvre la discussion privée avec le compte officiel et préremplit le message
  const url = `https://t.me/kalyxntw?text=${encodedText}`;

  const supported = await Linking.canOpenURL(url).catch(() => false);
  if (supported) {
    await Linking.openURL(url);
    return true;
  } else {
    // Fallback navigateur web si l'appli Telegram n'est pas installée
    await Linking.openURL(`https://web.telegram.org/k/#?text=${encodedText}`);
    return true;
  }
};
