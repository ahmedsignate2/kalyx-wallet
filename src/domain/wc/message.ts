/**
 * Décodage des messages WalletConnect pour affichage humain.
 *
 * Les dApps envoient `personal_sign` avec le message encodé en hex (0x…).
 * Beaucoup sont des messages SIWE (EIP-4361, « Sign-In With Ethereum ») :
 * on les parse pour montrer à l'utilisateur QUI demande QUOI, au lieu d'un
 * blob hexadécimal illisible — et détecter un éventuel phishing (le domaine
 * du message qui ne correspond pas au site connecté).
 *
 * Pur TypeScript, aucune dépendance UI. Pas de TextDecoder (absent sur
 * Hermes) : on passe par bytesToUtf8 de @noble/hashes.
 */
import { bytesToUtf8, hexToBytes } from '@noble/hashes/utils';

/** Décode une chaîne hex `0x…` en texte UTF-8 lisible, sinon null. */
export function hexToText(hex: string): string | null {
  if (typeof hex !== 'string') return null;
  const h = hex.startsWith('0x') || hex.startsWith('0X') ? hex.slice(2) : hex;
  if (h.length === 0 || h.length % 2 !== 0 || !/^[0-9a-fA-F]+$/.test(h)) return null;
  let text: string;
  try {
    text = bytesToUtf8(hexToBytes(h.toLowerCase()));
  } catch {
    return null;
  }
  // Rejette les contenus binaires : caractères de contrôle (hors \n \r \t)
  // ou caractère de remplacement U+FFFD issu d'un UTF-8 invalide.
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFD]/.test(text)) return null;
  return text;
}

/** Champs utiles d'un message SIWE (EIP-4361). */
export interface SiweMessage {
  /** Domaine qui demande la connexion (ligne 1) — à comparer au site réel. */
  domain: string;
  /** Adresse Ethereum concernée. */
  address: string;
  /** Phrase d'explication optionnelle affichée par la dApp. */
  statement?: string;
  uri?: string;
  version?: string;
  chainId?: number;
  nonce?: string;
  issuedAt?: string;
  expirationTime?: string;
}

const SIWE_HEADER = /^([^\n]+?) wants you to sign in with your Ethereum account:\r?\n(0x[0-9a-fA-F]{40})\r?\n/;

/**
 * Parse un message SIWE (déjà décodé en texte). Retourne null si le texte
 * ne suit pas le format EIP-4361.
 */
export function parseSiwe(text: string): SiweMessage | null {
  if (typeof text !== 'string') return null;
  const head = SIWE_HEADER.exec(text);
  if (!head) return null;

  const msg: SiweMessage = { domain: head[1].trim(), address: head[2] };
  const rest = text.slice(head[0].length).replace(/\r\n/g, '\n');

  // Corps : [ligne vide, statement?, ligne vide,] puis champs `Clé: valeur`.
  const lines = rest.split('\n');
  const fieldRe = /^(URI|Version|Chain ID|Nonce|Issued At|Expiration Time|Not Before|Request ID): (.*)$/;
  const statementLines: string[] = [];
  for (const line of lines) {
    const f = fieldRe.exec(line);
    if (f) {
      const value = f[2].trim();
      if (f[1] === 'URI') msg.uri = value;
      else if (f[1] === 'Version') msg.version = value;
      else if (f[1] === 'Chain ID') msg.chainId = Number.parseInt(value, 10) || undefined;
      else if (f[1] === 'Nonce') msg.nonce = value;
      else if (f[1] === 'Issued At') msg.issuedAt = value;
      else if (f[1] === 'Expiration Time') msg.expirationTime = value;
    } else if (line.trim().length > 0 && !line.startsWith('Resources:') && !line.startsWith('- ')) {
      statementLines.push(line.trim());
    }
  }
  if (statementLines.length > 0) msg.statement = statementLines.join(' ');
  return msg;
}

/**
 * Vrai si le domaine annoncé dans le SIWE ne correspond PAS au site connecté
 * (signal de phishing : un site X qui fait signer une connexion pour Y).
 * Tolère le sous-domaine (app.uniswap.org ⊂ uniswap.org) et ignore le port.
 */
export function siweDomainMismatch(siweDomain: string, dappUrl: string): boolean {
  const norm = (s: string) =>
    s.toLowerCase().replace(/^[a-z]+:\/\//, '').split('/')[0].split(':')[0].replace(/^www\./, '');
  const a = norm(siweDomain);
  const b = norm(dappUrl);
  if (!a || !b) return false; // pas assez d'info pour accuser
  return a !== b && !a.endsWith(`.${b}`) && !b.endsWith(`.${a}`);
}

/** Résumé d'un typed data EIP-712 (eth_signTypedData*). */
export interface TypedDataSummary {
  /** Nom du contrat/protocole déclaré dans le domaine EIP-712. */
  name?: string;
  /** Type principal signé (ex. `Permit`, `Order`). */
  primaryType?: string;
  chainId?: number;
  verifyingContract?: string;
  /**
   * Champs LISIBLES extraits du message (spender, montant, échéance…). Essentiel
   * pour un Permit/Permit2 : montrer QUI est autorisé et COMBIEN — sinon l'utilisateur
   * signe à l'aveugle le vecteur de drain le plus courant.
   */
  details?: { label: string; value: string }[];
  /** Adresse du token concerné (Permit2 : message.details.token ; Permit EIP-2612 : verifyingContract). */
  token?: string;
  /** Montant brut (entier, en unités du token) si présent. */
  amountRaw?: string;
  /** Vrai si le montant est « illimité » (≥ 2^160 − 2, type(uint160).max de Permit2 inclus). */
  unlimited?: boolean;
  /** Vrai pour une signature Permit2 (domaine « Permit2 » ou PermitSingle/PermitBatch/PermitTransferFrom). */
  permit2?: boolean;
}

/** BigInt tolérant (décimal, 0x-hex, number) ; null si non parsable. */
function asBigInt(v: unknown): bigint | null {
  try {
    if (typeof v === 'bigint') return v;
    if (typeof v === 'number' && Number.isFinite(v)) return BigInt(Math.trunc(v));
    if (typeof v === 'string' && v.trim()) return BigInt(v.trim());
    return null;
  } catch {
    return null;
  }
}

// Au-delà de ce seuil (≈ uint160 max), aucun montant de token réaliste : c'est une
// approbation « illimitée » (ERC-2612 = uint256 max, Permit2 = uint160 max).
const UNLIMITED = 2n ** 160n - 2n;
// Permit2 expiration = uint48 max ; ERC-2612 deadline sans limite = très grand.
const NO_EXPIRY = 281474976710655n; // 2^48 - 1

function fmtAmount(v: unknown): string | null {
  const n = asBigInt(v);
  if (n == null) return null;
  return n >= UNLIMITED ? 'Illimité ⚠️' : n.toString();
}

function fmtDeadline(v: unknown): string | null {
  const n = asBigInt(v);
  if (n == null || n === 0n) return null;
  if (n >= NO_EXPIRY) return 'Sans expiration ⚠️';
  const ms = Number(n) * 1000;
  const d = new Date(ms);
  return Number.isNaN(d.getTime()) ? null : `${d.toISOString().slice(0, 16).replace('T', ' ')} UTC`;
}

/** Extrait les champs sensibles d'un message EIP-712 (Permit / Permit2 / génériques). */
function extractDetails(message: unknown): { label: string; value: string }[] {
  if (!message || typeof message !== 'object' || Array.isArray(message)) return [];
  const m = message as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  const nested = m.details && typeof m.details === 'object' && !Array.isArray(m.details) ? m.details : {};
  const out: { label: string; value: string }[] = [];
  const push = (label: string, value: string | null) => {
    if (value != null && value !== '') out.push({ label, value });
  };
  const spender = m.spender ?? m.delegate ?? nested.spender;
  if (typeof spender === 'string') push('Autorisé (spender)', spender);
  const token = m.token ?? nested.token;
  if (typeof token === 'string') push('Token', token);
  const amount = m.value ?? m.amount ?? nested.amount;
  if (amount != null) push('Montant', fmtAmount(amount));
  const deadline = m.deadline ?? m.sigDeadline ?? m.expiration ?? nested.expiration;
  if (deadline != null) push('Échéance', fmtDeadline(deadline));
  return out;
}

/** Extrait les infos lisibles d'un payload eth_signTypedData (JSON ou objet). */
export function summarizeTypedData(raw: unknown): TypedDataSummary | null {
  let data: any = raw; // eslint-disable-line @typescript-eslint/no-explicit-any
  if (typeof raw === 'string') {
    try {
      data = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (!data || typeof data !== 'object') return null;
  const domain = data.domain ?? {};
  const out: TypedDataSummary = {};
  if (typeof domain.name === 'string') out.name = domain.name;
  if (typeof data.primaryType === 'string') out.primaryType = data.primaryType;
  const cid = Number(domain.chainId);
  if (Number.isFinite(cid) && cid > 0) out.chainId = cid;
  if (typeof domain.verifyingContract === 'string') out.verifyingContract = domain.verifyingContract;
  const details = extractDetails(data.message);
  if (details.length) out.details = details;
  // Token concerné : jamais domain.name (pour Permit2, ce serait « Permit2 » !).
  const m = (data.message ?? {}) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  const nested = m.details && typeof m.details === 'object' && !Array.isArray(m.details) ? m.details : {};
  const primary = String(out.primaryType ?? '');
  out.permit2 = domain.name === 'Permit2' || /^Permit(Single|Batch|TransferFrom|WitnessTransferFrom)$/.test(primary);
  const token = m.token ?? nested.token ?? (primary === 'Permit' && !out.permit2 ? domain.verifyingContract : undefined);
  if (typeof token === 'string') out.token = token;
  const amount = asBigInt(m.value ?? m.amount ?? nested.amount);
  if (amount != null) {
    out.amountRaw = amount.toString();
    out.unlimited = amount >= UNLIMITED;
  }
  return out.name || out.primaryType || out.details ? out : null;
}
