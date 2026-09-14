import { Linking, Platform } from 'react-native';
import { detectSensitiveSecrets } from './secretDetector';
import { technicalLogger } from './technicalLogger';

export interface SupportTicketParams {
  ticketId?: string;
  appVersion?: string;
  problem: string;
  network?: string;
  detectedError?: string;
  targetAmount?: string;
  userDescription?: string;
  recentLogs?: string;
}

/**
 * Génère un identifiant unique de ticket type KX-YYYYMMDD-XXXXX
 */
export function generateTicketId(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const rand = Math.floor(10000 + Math.random() * 90000);
  return `KX-${yyyy}${mm}${dd}-${rand}`;
}

/**
 * Récupère les métadonnées de version et d'environnement client
 */
export function getClientEnvironmentInfo(): string {
  let appVersion = '0.0.1';
  try {
    const Constants = require('expo-constants').default;
    if (Constants?.expoConfig?.version) {
      appVersion = Constants.expoConfig.version;
    }
  } catch {}

  const os = Platform?.OS === 'ios' ? 'iOS' : Platform?.OS === 'android' ? 'Android' : (Platform?.OS || 'Client');
  const osVer = Platform?.Version ? ` ${Platform.Version}` : '';
  return `Kalyx v${appVersion} (${os}${osVer})`.trim();
}

/**
 * Construit un contenu de ticket formaté selon le modèle standard du support Kalyx.
 */
export function buildSupportTicketContent(params: SupportTicketParams): string {
  const ticketId = params.ticketId || generateTicketId();
  const appVersion = params.appVersion || getClientEnvironmentInfo();
  const problem = params.problem || 'Problème technique non résolu';
  const network = params.network || 'Non spécifié';
  const detectedError =
    params.detectedError && !/^(?:Non déterminée|Inconnue|N\/A|\.\.\.)$/i.test(params.detectedError)
      ? params.detectedError
      : (technicalLogger.getDetectedError(network) || 'Non déterminée');
  const targetAmount = params.targetAmount || 'N/A';
  const userDescription = params.userDescription || 'Demande d\'assistance via le Copilot';
  let recentLogs = params.recentLogs;
  if (!recentLogs || /Aucun log technique récent|Aucun log récent|N\/A/i.test(recentLogs)) {
    recentLogs = technicalLogger.getCondensedTicketLogs(network, 5);
  }

  const ticketContent = (
    `🎫 [TICKET SUPPORT KALYX]\n` +
    `• ID : ${ticketId}\n` +
    `• Version : ${appVersion}\n` +
    `• Problème : ${problem}\n` +
    `• Réseau : ${network}\n` +
    `• Erreur détectée : ${detectedError}\n` +
    `• Montant visé : ${targetAmount}\n` +
    `• Description utilisateur : "${userDescription}"\n` +
    `• Logs récents :\n` +
    `${recentLogs}`
  );

  try {
    const { useTicketHistoryStore } = require('./ticketHistoryStore');
    useTicketHistoryStore.getState().addTicket({
      id: ticketId,
      problem,
      network,
      detectedError,
      content: ticketContent,
    });
  } catch {}

  return ticketContent;
}

/**
 * Normalise le contenu brut d'un ticket généré par l'IA pour garantir
 * la présence d'un identifiant unique (KX-YYYYMMDD-XXXXX) et de la version client.
 */
export function normalizeSupportTicket(rawContent: string, defaultNetwork?: string): string {
  if (!rawContent || typeof rawContent !== 'string') return '';
  let content = rawContent.trim();
  const ticketId = generateTicketId();
  const clientEnv = getClientEnvironmentInfo();

  // 1. Remplacement ou injection de l'ID de ticket (avec date réelle du jour)
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const todayPrefix = `KX-${yyyy}${mm}${dd}-`;

  const idMatch = content.match(/• ID\s*:\s*([^\r\n]+)/i);
  if (idMatch) {
    const existingId = idMatch[1].trim();
    const isTodayValid = existingId.startsWith(todayPrefix) && /^KX-\d{8}-\d{4,6}$/.test(existingId);
    if (!isTodayValid || /YYYYMMDD|XXXXX|\[ID\]|N\/A|\.\.\./i.test(existingId)) {
      content = content.replace(/• ID\s*:\s*[^\r\n]+/i, `• ID : ${ticketId}`);
    }
  } else {
    content = content.replace(
      /(🎫\s*\[TICKET SUPPORT KALYX\](?:\r?\n)?)/i,
      `$1• ID : ${ticketId}\n`
    );
  }

  // 2. Remplacement ou injection de la version
  if (/• Version\s*:\s*(?:Kalyx v[0-9.]+|\[Version\]|N\/A|\.\.\.)/i.test(content)) {
    content = content.replace(/• Version\s*:\s*[^\n]+/i, `• Version : ${clientEnv}`);
  } else if (!/• Version\s*:/i.test(content)) {
    if (/• ID\s*:[^\n]*/i.test(content)) {
      content = content.replace(
        /(• ID\s*:[^\n]*(?:\r?\n)?)/i,
        `$1• Version : ${clientEnv}\n`
      );
    } else {
      content = content.replace(
        /(🎫\s*\[TICKET SUPPORT KALYX\](?:\r?\n)?)/i,
        `$1• Version : ${clientEnv}\n`
      );
    }
  }

  // 3. Extraction du réseau concerné pour filtrage et corrélation
  const networkMatch = content.match(/• Réseau\s*:\s*([^\r\n]+)/i);
  const targetNetwork = (networkMatch ? networkMatch[1].trim() : defaultNetwork) || undefined;

  // 4. Corrélation de "Erreur détectée" avec les logs réels
  const errMatch = content.match(/• Erreur détectée\s*:\s*([^\r\n]+)/i);
  const currentErr = errMatch ? errMatch[1].trim() : '';
  if (!currentErr || /^(?:Non déterminée|Inconnue|N\/A|Aucune|\.\.\.)$/i.test(currentErr)) {
    const detected = technicalLogger.getDetectedError(targetNetwork);
    if (detected) {
      if (errMatch) {
        content = content.replace(/• Erreur détectée\s*:\s*[^\r\n]+/i, `• Erreur détectée : ${detected}`);
      } else {
        content = content.replace(
          /(• Réseau\s*:[^\r\n]*(?:\r?\n)?)/i,
          `$1• Erreur détectée : ${detected}\n`
        );
      }
    }
  }

  // 5. Formatage condensé et filtrage des logs récents (évite le dump JSON brut et priorise le réseau)
  const logsMatch = content.match(/• Logs récents\s*:\s*([\s\S]*)$/i);
  const currentLogsText = logsMatch ? logsMatch[1].trim() : '';
  const isGenericOrDump =
    !currentLogsText ||
    /^(?:Aucun log récent|Aucun log technique récent|N\/A|\.\.\.)$/i.test(currentLogsText) ||
    currentLogsText.includes('{"') ||
    currentLogsText.includes('RPC error on');

  if (isGenericOrDump || !/• Logs récents\s*:/i.test(content)) {
    const formattedLogs = technicalLogger.getCondensedTicketLogs(targetNetwork, 5);
    if (/• Logs récents\s*:/i.test(content)) {
      content = content.replace(/• Logs récents\s*:\s*[\s\S]*$/i, `• Logs récents :\n${formattedLogs}`);
    } else {
      content += `\n• Logs récents :\n${formattedLogs}`;
    }
  }

  try {
    const { useTicketHistoryStore } = require('./ticketHistoryStore');
    useTicketHistoryStore.getState().addTicket({ content });
  } catch {}

  return content;
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
