import { wordlist } from '@scure/bip39/wordlists/english';

const BIP39_SET = new Set(wordlist);

export interface SecretDetectionResult {
  hasSecret: boolean;
  reason?: 'mnemonic' | 'hex_key' | 'base58_key';
  warningMessage?: string;
}

const SECRET_WARNING_MESSAGE =
  'Attention : ton message contient une clé privée ou une phrase secrète. Pour ta sécurité, supprime-la de ton message avant de créer un ticket. Le support ne te demandera jamais tes identifiants secrets.';

/**
 * Détecte si un texte contient une phrase mnémonique (BIP-39), une clé privée hexadécimale (64 caractères)
 * ou une clé privée Solana en Base58.
 */
export function detectSensitiveSecrets(text: string): SecretDetectionResult {
  if (!text || typeof text !== 'string') {
    return { hasSecret: false };
  }

  // 1. Détection de clés privées hexadécimales brutes (64 hex avec ou sans 0x)
  // Exclut les masques déjà caviardés comme [CLÉ_MASQUÉE] ou [REDACTED]
  const hexPattern = /(?:^|[^a-fA-F0-9])(?:0x)?([a-fA-F0-9]{64})(?:$|[^a-fA-F0-9])/;
  if (hexPattern.test(text)) {
    return {
      hasSecret: true,
      reason: 'hex_key',
      warningMessage: SECRET_WARNING_MESSAGE,
    };
  }

  // 2. Détection de clés privées Base58 (Solana : 64 octets = 87-88 caractères Base58, ou clé 32 octets = 43-44 caractères)
  // Caractères Base58 : [1-9A-HJ-NP-Za-km-z]
  const b58KeyPattern = /(?:^|[^1-9A-HJ-NP-Za-km-z])([1-9A-HJ-NP-Za-km-z]{80,90})(?:$|[^1-9A-HJ-NP-Za-km-z])/;
  if (b58KeyPattern.test(text)) {
    return {
      hasSecret: true,
      reason: 'base58_key',
      warningMessage: SECRET_WARNING_MESSAGE,
    };
  }

  // 3. Détection de phrase de récupération BIP-39 (12 ou 24 mots)
  // On extrait tous les mots consécutifs en minuscules
  const words = text
    .toLowerCase()
    .replace(/[^a-z\s]/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (words.length >= 11) {
    let consecutiveBip39 = 0;
    let maxConsecutive = 0;
    let totalBip39 = 0;

    for (const w of words) {
      if (BIP39_SET.has(w)) {
        consecutiveBip39++;
        totalBip39++;
        if (consecutiveBip39 > maxConsecutive) {
          maxConsecutive = consecutiveBip39;
        }
      } else {
        consecutiveBip39 = 0;
      }
    }

    // Si on a 11 mots ou plus consécutifs qui font partie du dictionnaire BIP-39,
    // ou si une proportion massive (>80%) des mots d'une phrase de 12+ mots sont dans BIP-39
    if (maxConsecutive >= 11 || (words.length <= 26 && totalBip39 >= 12 && totalBip39 / words.length >= 0.8)) {
      return {
        hasSecret: true,
        reason: 'mnemonic',
        warningMessage: SECRET_WARNING_MESSAGE,
      };
    }
  }

  return { hasSecret: false };
}

/**
 * Assainit un texte en masquant les clés privées et phrases secrètes
 * pour l'enregistreur de logs ou l'affichage de tickets.
 */
export function sanitizeSecrets(text: string): string {
  if (!text || typeof text !== 'string') return '';

  return text
    // Masquage des paramètres sensibles type mot de passe / seed / clé
    .replace(/(?:password|secret|private[_-]?key|mnemonic|seed|authorization|bearer)\s*[:=]\s*["']?[^"',\s}]+/gi, '$1=[MASQUÉ]')
    // Masquage des clés privées hexadécimales 64 car
    .replace(/\b(?:0x)?[a-fA-F0-9]{64}\b/g, '[CLÉ_HEX_MASQUÉE]')
    // Masquage des clés Base58 longues
    .replace(/\b[1-9A-HJ-NP-Za-km-z]{80,90}\b/g, '[CLÉ_B58_MASQUÉE]')
    // Masquage des adresses complètes (garder les 6 premiers et 4 derniers caractères pour identifier le compte sans fuite)
    .replace(/\b(0x[a-fA-F0-9]{4})[a-fA-F0-9]{32}([a-fA-F0-9]{4})\b/g, '$1…$2')
    .replace(/\b([1-9A-HJ-NP-Za-km-z]{4})[1-9A-HJ-NP-Za-km-z]{24,36}([1-9A-HJ-NP-Za-km-z]{4})\b/g, '$1…$2')
    .replace(/\b(bc1[a-z0-9]{4})[a-z0-9]{20,50}([a-z0-9]{4})\b/g, '$1…$2');
}
