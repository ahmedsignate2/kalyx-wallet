import { sanitizeSecrets } from './secretDetector';

export interface TechnicalLogEntry {
  timestamp: string;
  category: string;
  message: string;
  details?: string;
}

const MAX_LOGS = 30;
const technicalLogBuffer: TechnicalLogEntry[] = [];

/**
 * Enregistre un log technique en mémoire (ex: erreur RPC, échec broadcast, code HTTP).
 * RÈGLE ABSOLUE : Les secrets (clés privées, mnémoniques, mots de passe) et adresses complètes
 * sont assainis en amont avant toute écriture en mémoire.
 */
export function recordTechnicalLog(category: string, message: string, details?: unknown): void {
  const now = new Date();
  const timeStr = now.toTimeString().split(' ')[0]; // HH:MM:SS

  // Assainissement strict
  const cleanMessage = sanitizeSecrets(String(message || ''));
  let cleanDetails: string | undefined;

  if (details !== undefined && details !== null) {
    if (typeof details === 'string') {
      cleanDetails = sanitizeSecrets(details);
    } else if (typeof details === 'object') {
      try {
        const rawJson = JSON.stringify(details);
        cleanDetails = sanitizeSecrets(rawJson);
      } catch {
        cleanDetails = sanitizeSecrets(String(details));
      }
    } else {
      cleanDetails = String(details);
    }
  }

  const entry: TechnicalLogEntry = {
    timestamp: timeStr,
    category: category.trim().toUpperCase(),
    message: cleanMessage,
    details: cleanDetails,
  };

  technicalLogBuffer.push(entry);

  // Maintien du tampon circulaire (20 à 30 entrées max)
  if (technicalLogBuffer.length > MAX_LOGS) {
    technicalLogBuffer.shift();
  }
}

/**
 * Récupère les logs récents sous forme de lignes formatées.
 */
export function getRecentTechnicalLogs(limit = 25): string[] {
  const slice = technicalLogBuffer.slice(-limit);
  return slice.map((log) => {
    const detailPart = log.details ? ` - ${log.details}` : '';
    return `[${log.timestamp}] [${log.category}] ${log.message}${detailPart}`;
  });
}

/**
 * Récupère les logs récents sous forme de chaîne de texte prête à être injectée
 * dans un ticket de support ou le contexte IA.
 */
export function getFormattedTechnicalLogs(limit = 25): string {
  const logs = getRecentTechnicalLogs(limit);
  if (logs.length === 0) {
    return 'Aucun log technique récent.';
  }
  return logs.join('\n');
}

/**
 * Efface le tampon de logs techniques.
 */
export function clearTechnicalLogs(): void {
  technicalLogBuffer.length = 0;
}
