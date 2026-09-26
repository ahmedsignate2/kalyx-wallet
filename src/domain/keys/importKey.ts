/**
 * Analyse d'une clé privée collée à l'import, quelle que soit sa forme.
 *
 * L'import n'acceptait qu'une clé EVM en hexadécimal. Une clé Bitcoin au format
 * WIF ou une clé Solana exportée depuis Phantom étaient refusées sans
 * explication — alors que ce sont les deux formes que les utilisateurs ont
 * réellement en main.
 *
 * TOUT EST PUR ICI, et c'est délibéré : une erreur d'analyse ne produit pas un
 * message maladroit, elle dérive une mauvaise adresse et fait croire à des fonds
 * perdus. Ce module ne touche ni au coffre, ni au stockage, ni au réseau, et
 * chaque forme reconnue est couverte par un test.
 *
 * Il ne DÉCIDE rien non plus : 32 octets en hexadécimal sont légitimement une
 * clé EVM et une clé Bitcoin — même courbe, même secret, deux dérivations
 * d'adresse. Il rend donc les familles POSSIBLES et laisse le choix à
 * l'appelant, plutôt que d'en inventer un.
 */
import { base58, hex } from '@scure/base';
import { sha256 } from '@noble/hashes/sha2';
import { secp256k1 } from '@noble/curves/secp256k1';
import { ed25519 } from '@noble/curves/ed25519';

/** Famille de chaînes qu'une clé peut servir. */
export type KeyFamily = 'evm' | 'bitcoin' | 'solana';

/** Forme sous laquelle la clé a été reconnue. */
export type KeyFormat =
  /** 64 caractères hexadécimaux, avec ou sans `0x`. */
  | 'hex32'
  /** 128 caractères hexadécimaux : les 64 octets de Solana. */
  | 'hex64'
  /** Wallet Import Format Bitcoin (base58check, version 0x80). */
  | 'wif'
  /** 64 octets en base58 : graine puis clé publique (export Phantom). */
  | 'solana-base58-64'
  /** 32 octets en base58 : la graine seule. */
  | 'solana-base58-32'
  /** Tableau JSON de 64 entiers (`solana-keygen`). */
  | 'solana-json';

export interface ParsedKey {
  format: KeyFormat;
  /** Secret de 32 octets, forme canonique quelle que soit l'entrée. */
  secret: Uint8Array;
  /** Familles que cette clé peut servir. */
  families: KeyFamily[];
  /**
   * Clé publique compressée, pour un WIF qui le déclare.
   *
   * Le drapeau de compression change l'adresse Bitcoin dérivée : le perdre,
   * c'est dériver une adresse que l'utilisateur ne reconnaîtra pas et le laisser
   * croire que ses fonds ont disparu.
   */
  compressed?: boolean;
}

/** Raison d'un refus, sous forme de code — ce module n'écrit pas de phrase. */
export type KeyParseError =
  | 'EMPTY'
  | 'UNRECOGNISED'
  /** Hors de l'intervalle valide de secp256k1 (zéro ou ≥ n). */
  | 'OUT_OF_RANGE'
  /** Somme de contrôle base58check fausse : une faute de frappe, pas une clé. */
  | 'BAD_CHECKSUM'
  /** Version WIF inconnue (ni réseau principal, ni test). */
  | 'BAD_WIF_VERSION'
  /** Les 64 octets Solana sont incohérents : la clé publique ne suit pas. */
  | 'SOLANA_MISMATCH';

export type KeyParseResult = { ok: true; key: ParsedKey } | { ok: false; error: KeyParseError };

/** Le secret est-il un scalaire secp256k1 valide ? Zéro et ≥ n sont refusés. */
function validSecp(secret: Uint8Array): boolean {
  try {
    const k = BigInt('0x' + hex.encode(secret));
    return k > 0n && k < secp256k1.CURVE.n;
  } catch {
    return false;
  }
}

/** base58check : décode et VÉRIFIE la somme de contrôle. */
function base58checkDecode(input: string): Uint8Array | null {
  let raw: Uint8Array;
  try {
    raw = base58.decode(input);
  } catch {
    return null;
  }
  if (raw.length < 5) return null;
  const body = raw.subarray(0, raw.length - 4);
  const sum = raw.subarray(raw.length - 4);
  const expect = sha256(sha256(body)).subarray(0, 4);
  for (let i = 0; i < 4; i++) if (sum[i] !== expect[i]) return null;
  return body;
}

/**
 * 64 octets Solana → graine de 32, après VÉRIFICATION.
 *
 * Les 32 derniers octets sont la clé publique. On la recalcule depuis la graine
 * et on compare : c'est gratuit, et cela attrape un copier-coller tronqué ou
 * deux clés collées bout à bout — deux erreurs qui produiraient sinon un
 * portefeuille à une adresse inattendue, que l'utilisateur croirait vide.
 */
function fromSolana64(bytes: Uint8Array, format: KeyFormat): KeyParseResult {
  if (bytes.length !== 64) return { ok: false, error: 'UNRECOGNISED' };
  const seed = bytes.subarray(0, 32);
  const claimed = bytes.subarray(32, 64);
  let derived: Uint8Array;
  try {
    derived = ed25519.getPublicKey(seed);
  } catch {
    return { ok: false, error: 'UNRECOGNISED' };
  }
  for (let i = 0; i < 32; i++) {
    if (derived[i] !== claimed[i]) return { ok: false, error: 'SOLANA_MISMATCH' };
  }
  return { ok: true, key: { format, secret: seed, families: ['solana'] } };
}

/**
 * Analyse une clé collée.
 *
 * L'ORDRE DES TENTATIVES COMPTE. Les formes non ambiguës d'abord — un tableau
 * JSON et un WIF se reconnaissent à coup sûr —, puis l'hexadécimal, puis la
 * base58 dont la longueur décodée tranche. Commencer par la base58 ferait passer
 * un WIF pour une graine Solana de 32 octets, puisqu'un WIF est aussi de la
 * base58.
 */
export function parseImportedKey(input: string): KeyParseResult {
  const s = (input ?? '').trim();
  if (!s) return { ok: false, error: 'EMPTY' };

  // ── Tableau JSON de solana-keygen ─────────────────────────────────────────
  if (s.startsWith('[')) {
    let arr: unknown;
    try {
      arr = JSON.parse(s);
    } catch {
      return { ok: false, error: 'UNRECOGNISED' };
    }
    if (!Array.isArray(arr) || arr.length !== 64) return { ok: false, error: 'UNRECOGNISED' };
    if (!arr.every((n) => typeof n === 'number' && Number.isInteger(n) && n >= 0 && n <= 255)) {
      return { ok: false, error: 'UNRECOGNISED' };
    }
    return fromSolana64(Uint8Array.from(arr as number[]), 'solana-json');
  }

  // ── WIF Bitcoin ───────────────────────────────────────────────────────────
  // Réseau principal : commence par 5 (non compressé) ou K/L (compressé).
  // Réseau de test : 9 ou c.
  if (/^[5KL9c][1-9A-HJ-NP-Za-km-z]{50,51}$/.test(s)) {
    const body = base58checkDecode(s);
    if (!body) return { ok: false, error: 'BAD_CHECKSUM' };
    if (body[0] !== 0x80 && body[0] !== 0xef) return { ok: false, error: 'BAD_WIF_VERSION' };
    // 33 octets = non compressé ; 34 avec le drapeau 0x01 en queue = compressé.
    if (body.length !== 33 && body.length !== 34) return { ok: false, error: 'UNRECOGNISED' };
    if (body.length === 34 && body[33] !== 0x01) return { ok: false, error: 'UNRECOGNISED' };
    const secret = body.slice(1, 33);
    if (!validSecp(secret)) return { ok: false, error: 'OUT_OF_RANGE' };
    return {
      ok: true,
      key: { format: 'wif', secret, families: ['bitcoin'], compressed: body.length === 34 },
    };
  }

  // ── Hexadécimal ───────────────────────────────────────────────────────────
  const noPrefix = s.replace(/^0x/i, '');
  if (/^[0-9a-fA-F]{64}$/.test(noPrefix)) {
    const secret = hex.decode(noPrefix.toLowerCase());
    /*
     * MÊME SECRET, TROIS USAGES. 32 octets sur secp256k1 servent l'EVM et
     * Bitcoin ; les 32 mêmes octets sont aussi une graine ed25519 valide, donc
     * une clé Solana. On ne tranche pas : l'utilisateur sait ce qu'il importe,
     * nous non — et deviner ferait dériver une adresse qu'il ne reconnaîtrait
     * pas.
     */
    const families: KeyFamily[] = [];
    if (validSecp(secret)) families.push('evm', 'bitcoin');
    families.push('solana');
    return { ok: true, key: { format: 'hex32', secret, families } };
  }
  if (/^[0-9a-fA-F]{128}$/.test(noPrefix)) {
    return fromSolana64(hex.decode(noPrefix.toLowerCase()), 'hex64');
  }

  // ── base58 : la longueur décodée tranche ──────────────────────────────────
  let bytes: Uint8Array | null = null;
  try {
    bytes = base58.decode(s);
  } catch {
    bytes = null;
  }
  if (bytes) {
    if (bytes.length === 64) return fromSolana64(bytes, 'solana-base58-64');
    if (bytes.length === 32) {
      return { ok: true, key: { format: 'solana-base58-32', secret: bytes, families: ['solana'] } };
    }
  }

  return { ok: false, error: 'UNRECOGNISED' };
}
