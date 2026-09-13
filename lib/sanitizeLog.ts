/**
 * Filtre d'assainissement automatique (Zéro secret)
 * Nettoie toute chaîne avant écriture dans le tampon de logs techniques en mémoire.
 */
export const sanitizeLog = (raw: string): string => {
  if (!raw || typeof raw !== 'string') return '';
  let clean = raw;

  // 1. Clés privées hexadécimales (64 chars hexadécimaux avec ou sans 0x)
  clean = clean.replace(/\b(0x)?[a-fA-F0-9]{64}\b/g, '[CLÉ_PRIVÉE_MASQUÉE]');

  // 2. Clés privées Solana base58 (environ 80 à 90 caractères Base58)
  clean = clean.replace(/\b[1-9A-HJ-NP-Za-km-z]{80,90}\b/g, '[CLÉ_SOL_MASQUÉE]');

  // 3. Masquage des paramètres sensibles évidents (password, secret, private_key, mnemonic, seed, token)
  clean = clean.replace(
    /(?:password|secret|private[_-]?key|mnemonic|seed|authorization|bearer)\s*[:=]\s*["']?[^"',\s}]+/gi,
    (match) => {
      const key = match.split(/[:=]/)[0];
      return `${key}=[MASQUÉ]`;
    }
  );

  // 4. Adresses EVM complètes (0x... 40 hex chars) : raccourcir pour garder début/fin technique
  clean = clean.replace(/\b(0x[a-fA-F0-9]{40})\b/g, (addr) => `${addr.slice(0, 6)}...${addr.slice(-4)}`);

  // 5. Adresses Solana / Base58 (32 à 44 chars)
  clean = clean.replace(/\b([1-9A-HJ-NP-Za-km-z]{32,44})\b/g, (addr) => `${addr.slice(0, 4)}...${addr.slice(-4)}`);

  // 6. Adresses Bitcoin SegWit (bc1... 20 à 60 chars)
  clean = clean.replace(/\b(bc1[a-z0-9]{20,60})\b/g, (addr) => `${addr.slice(0, 6)}...${addr.slice(-4)}`);

  return clean;
};
