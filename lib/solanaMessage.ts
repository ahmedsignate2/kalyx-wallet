/**
 * MESSAGE SOLANA À SIGNER — un seul décodage, partagé par la fenêtre qui le
 * MONTRE et par la fonction qui le SIGNE.
 *
 *  - Spec WalletConnect : `message` est du base58. S'il n'en est pas, c'est le
 *    texte lui-même (UTF-8) qui est signé. Aucune autre devinette (base64…) :
 *    deux décodeurs différents d'un côté et de l'autre, c'est signer autre chose
 *    que ce qui a été affiché.
 *  - Une signature de message ed25519 est indiscernable d'une signature de
 *    transaction : des octets qui se lisent comme une transaction (ou son
 *    message) Solana sont REFUSÉS — sinon une dApp ferait signer un transfert
 *    sous l'apparence d'un « message ».
 */
import { utf8ToBytes } from '@noble/hashes/utils';
import { base58 } from '@scure/base';

/**
 * UTF-8 STRICT : nul au moindre octet invalide (continuation manquante, forme
 * trop longue, demi-paire, au-delà de U+10FFFF). Un décodeur tolérant avalait
 * des octets : la fenêtre aurait montré un texte et l'utilisateur signé autre
 * chose. Ne lève jamais — les octets viennent d'une dApp.
 */
function strictUtf8(b: Uint8Array): string | null {
  let out = '';
  for (let i = 0; i < b.length; ) {
    const c = b[i++];
    let need: number;
    let cp: number;
    let min: number;
    if (c < 0x80) {
      out += String.fromCharCode(c);
      continue;
    } else if (c >= 0xc2 && c < 0xe0) [need, cp, min] = [1, c & 0x1f, 0x80];
    else if (c >= 0xe0 && c < 0xf0) [need, cp, min] = [2, c & 0x0f, 0x800];
    else if (c >= 0xf0 && c < 0xf5) [need, cp, min] = [3, c & 0x07, 0x10000];
    else return null;
    if (i + need > b.length) return null;
    for (let k = 0; k < need; k++) {
      const x = b[i++];
      if ((x & 0xc0) !== 0x80) return null;
      cp = (cp << 6) | (x & 0x3f);
    }
    if (cp < min || cp > 0x10ffff || (cp >= 0xd800 && cp <= 0xdfff)) return null;
    out += String.fromCodePoint(cp);
  }
  return out;
}

/** Texte lisible : UTF-8 valide, sans caractère de contrôle hors blancs. */
function readableText(bytes: Uint8Array): string | null {
  const txt = strictUtf8(bytes);
  if (txt === null) return null;
  return /^[\x20-\x7E\u00A0-\uFFFF\s]*$/.test(txt) ? txt : null;
}

/** Lecteur du format filaire Solana : lève dès qu'un octet manque. */
function reader(b: Uint8Array) {
  let i = 0;
  const need = (n: number) => {
    if (i + n > b.length) throw new Error('court');
  };
  return {
    get pos() {
      return i;
    },
    u8() {
      need(1);
      return b[i++];
    },
    skip(n: number) {
      need(n);
      i += n;
    },
    /** compact-u16 (1 à 3 octets). */
    cu16() {
      let v = 0;
      for (let k = 0; k < 3; k++) {
        const x = this.u8();
        v |= (x & 0x7f) << (7 * k);
        if (!(x & 0x80)) return v;
      }
      throw new Error('cu16');
    },
  };
}

/** Message (legacy ou v0) lu depuis `r`, cohérent : signataires présents, programmes indexés. */
function readMessage(r: ReturnType<typeof reader>): void {
  let first = r.u8();
  let v0 = false;
  if (first & 0x80) {
    if ((first & 0x7f) !== 0) throw new Error('version');
    v0 = true;
    first = r.u8();
  }
  const required = first;
  r.u8();
  r.u8();
  const keys = r.cu16();
  if (required < 1 || keys < required) throw new Error('entête');
  r.skip(32 * keys);
  r.skip(32); // blockhash
  const ixs = r.cu16();
  for (let k = 0; k < ixs; k++) {
    if (r.u8() >= keys) throw new Error('programme'); // toujours une clé statique, v0 compris
    r.skip(r.cu16());
    r.skip(r.cu16());
  }
  if (v0) {
    const lookups = r.cu16();
    for (let k = 0; k < lookups; k++) {
      r.skip(32);
      r.skip(r.cu16());
      r.skip(r.cu16());
    }
  }
}

function parsesExactly(bytes: Uint8Array, withSignatures: boolean): boolean {
  try {
    const r = reader(bytes);
    if (withSignatures) {
      const n = r.cu16();
      if (n < 1) return false;
      r.skip(64 * n);
    }
    readMessage(r);
    // Exactement : une signature ne vaut que pour ces octets-là, sans reste.
    return r.pos === bytes.length;
  } catch {
    return false;
  }
}

/**
 * Ces octets se lisent-ils comme une transaction Solana, ou comme son message
 * (ce que couvre réellement la signature) ?
 */
export function looksLikeSolanaTransaction(bytes: Uint8Array): boolean {
  return parsesExactly(bytes, false) || parsesExactly(bytes, true);
}

/**
 * Octets à signer et texte à montrer. `text` est nul pour des octets binaires :
 * la fenêtre affiche alors la chaîne reçue telle quelle.
 */
export function solanaMessageBytes(raw: string): { bytes: Uint8Array; text: string | null } {
  let bytes: Uint8Array | null = null;
  try {
    bytes = raw ? base58.decode(raw) : null;
  } catch {
    bytes = null;
  }
  if (!bytes) {
    // Pas du base58 : c'est le texte reçu qui est signé, et montré.
    return { bytes: utf8ToBytes(raw), text: raw };
  }
  return { bytes, text: readableText(bytes) };
}
