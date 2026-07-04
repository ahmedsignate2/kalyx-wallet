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
  return out.name || out.primaryType ? out : null;
}
