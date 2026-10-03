import { HEX_SECRET_RE, maskBip39Runs, maskSensitiveFields, stripUrlSecrets } from './sanitizeLog';
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
export function detectSensitiveSecrets(input: string, knownHashes: Iterable<string> = []): SecretDetectionResult {
  if (!input || typeof input !== 'string') {
    return { hasSecret: false };
  }
  /*
   * HASHES DE TRANSACTION AUTORISÉS — SEULEMENT LES NÔTRES. Un hash EVM
   * (0x + 64 hex) a exactement la forme d'une clé privée : aucune règle de
   * forme ne les distingue. Laisser passer tout ce qui suit « tx: » ouvrait
   * donc la porte à « tx: <clé privée> ». Désormais, une valeur n'est retirée
   * que si c'est le hash d'une transaction CONNUE de l'app (historique, journal
   * technique) ; toute autre valeur de cette forme reste bloquée.
   */
  const known = new Set(Array.from(knownHashes, (h) => h.toLowerCase().replace(/^0x/, '')));
  const strip = (v: string) => (known.has(v.toLowerCase().replace(/^0x/, '')) ? '[hash]' : v);
  const text = input.replace(/(?:0x)?[0-9A-Za-z]{43,90}/g, strip);

  // 1. Détection de clés privées hexadécimales brutes (64 hex avec ou sans 0x)
  // Exclut les masques déjà caviardés comme [CLÉ_MASQUÉE] ou [REDACTED]
  // 64 (clé 32 octets) ou 128 (clé ed25519 / graine de 64 octets) : `{64}` seul laissait passer les 128.
  const hexPattern = /(?:^|[^a-fA-F0-9])(?:0x)?([a-fA-F0-9]{128}|[a-fA-F0-9]{64})(?:$|[^a-fA-F0-9])/;
  // Clés étendues (xprv…) et WIF : elles aussi donnent les fonds.
  const xprvOrWif = /\b(?:[xyz]prv[1-9A-HJ-NP-Za-km-z]{50,120}|[5KLc][1-9A-HJ-NP-Za-km-z]{50,51})\b/;
  if (hexPattern.test(text) || xprvOrWif.test(text)) {
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

  // Phrase de récupération et champs sensibles : mêmes règles que les journaux
  // (la phrase restait EN CLAIR dans l'historique du Copilote, le nom du champ
  // devenait le littéral « $1 »).
  return stripUrlSecrets(maskSensitiveFields(maskBip39Runs(text)))
    // Masquage des clés privées hexadécimales 64 car
    .replace(HEX_SECRET_RE, '[CLÉ_HEX_MASQUÉE]')
    // Masquage des clés Base58 longues
    .replace(/\b[1-9A-HJ-NP-Za-km-z]{80,90}\b/g, '[CLÉ_B58_MASQUÉE]')
    // Masquage des adresses complètes (garder les 6 premiers et 4 derniers caractères pour identifier le compte sans fuite)
    .replace(/\b(0x[a-fA-F0-9]{4})[a-fA-F0-9]{32}([a-fA-F0-9]{4})\b/g, '$1…$2')
    .replace(/\b([1-9A-HJ-NP-Za-km-z]{4})[1-9A-HJ-NP-Za-km-z]{24,36}([1-9A-HJ-NP-Za-km-z]{4})\b/g, '$1…$2')
    .replace(/\b(bc1[a-z0-9]{4})[a-z0-9]{20,50}([a-z0-9]{4})\b/g, '$1…$2');
}

/**
 * Secrets masqués, RIEN d'autre : adresses et liens restent entiers. Pour ce
 * que l'utilisateur relit (historique du Copilote), où une adresse raccourcie
 * ne servirait plus.
 */
export function maskSecretsOnly(text: string, knownHashes: Iterable<string> = []): string {
  if (!text || typeof text !== 'string') return '';
  // Un hash de transaction CONNU a la forme d'une clé privée mais n'en est pas une : il reste lisible.
  const known = new Set([...knownHashes].map((h) => h.toLowerCase().replace(/^0x/, '')));
  return maskSensitiveFields(maskBip39Runs(text))
    .replace(HEX_SECRET_RE, (m) => (known.has(m.toLowerCase().replace(/^0x/, '')) ? m : '[CLÉ_HEX_MASQUÉE]'))
    .replace(/\b[xyz]prv[1-9A-HJ-NP-Za-km-z]{50,120}\b/g, '[CLÉ_ÉTENDUE_MASQUÉE]')
    .replace(/\b[5KLc][1-9A-HJ-NP-Za-km-z]{50,51}\b/g, '[CLÉ_WIF_MASQUÉE]')
    .replace(/\b[1-9A-HJ-NP-Za-km-z]{80,90}\b/g, '[CLÉ_B58_MASQUÉE]');
}
