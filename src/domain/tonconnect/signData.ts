/**
 * TON Connect — `signData` : signer des DONNÉES (texte, octets, cellule), pas
 * une transaction. Spécification : ton-blockchain/ton-connect, spec/rpc.md
 * (« signData »). Vérifié octet par octet contre l'implémentation de référence
 * (mois-ilya/sign-data-reference, reprise par Tonkeeper) : voir les tests.
 *
 *  - text / binary : sha256(0xffff ‖ "ton-connect/sign-data/" ‖ workchain(i32)
 *    ‖ hash(32) ‖ len(domaine)(u32) ‖ domaine ‖ horodatage(u64) ‖ "txt"|"bin"
 *    ‖ len(données)(u32) ‖ données), signé en Ed25519 ;
 *  - cell : hachage de la cellule
 *    message#75569022 crc32(schéma) horodatage adresse ^domaine(TEP-81) ^cellule.
 *
 * Aucune clé ici : ce module calcule CE QUI est signé. La signature est faite
 * par le coffre, après confirmation de l'utilisateur.
 */
import { sha256 } from '@noble/hashes/sha256';
import { utf8ToBytes } from '@noble/hashes/utils';
import { base64 } from '@scure/base';
import { Address, beginCell, Cell } from '@ton/core';

export type SignDataPayload =
  | { type: 'text'; text: string; network?: string; from?: string }
  | { type: 'binary'; bytes: string; network?: string; from?: string }
  | { type: 'cell'; schema: string; cell: string; network?: string; from?: string };

/** Taille maximale acceptée (les données sont affichées ou décodées avant signature). */
const MAX_BYTES = 64 * 1024;

/** Demande lue et vérifiée, ou `null` si elle est mal formée (réponse BAD_REQUEST). */
export function parseSignDataPayload(raw: unknown): SignDataPayload | null {
  let p: Record<string, unknown>;
  try {
    p = (typeof raw === 'string' ? JSON.parse(raw) : raw) as Record<string, unknown>;
  } catch {
    return null;
  }
  if (!p || typeof p !== 'object') return null;
  const extra = {
    ...(typeof p.network === 'string' ? { network: p.network } : {}),
    ...(typeof p.from === 'string' ? { from: p.from } : {}),
  };
  if (p.type === 'text' && typeof p.text === 'string' && p.text.length <= MAX_BYTES) return { type: 'text', text: p.text, ...extra };
  if (p.type === 'binary' && typeof p.bytes === 'string') {
    try {
      if (base64.decode(p.bytes).length > MAX_BYTES) return null;
    } catch {
      return null;
    }
    return { type: 'binary', bytes: p.bytes, ...extra };
  }
  if (p.type === 'cell' && typeof p.schema === 'string' && typeof p.cell === 'string') {
    try {
      Cell.fromBase64(p.cell);
    } catch {
      return null;
    }
    return { type: 'cell', schema: p.schema, cell: p.cell, ...extra };
  }
  return null;
}

/** CRC-32 (IEEE 802.3, celle du paquet `crc-32`), non signé. */
export function crc32(bytes: Uint8Array): number {
  let c = ~0;
  for (let i = 0; i < bytes.length; i++) {
    c ^= bytes[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

/**
 * Domaine au format DNS de TEP-81 : labels inversés, chacun suivi d'un octet
 * nul (« app.ston.fi » → « fi\0ston\0app\0 »). Un nom non ASCII (IDN) est refusé
 * plutôt que mal encodé.
 */
export function encodeDnsName(domain: string): string {
  let d = domain.toLowerCase();
  if (d.endsWith('.')) d = d.slice(0, -1);
  if (!d) return '\0';
  const labels = d.split('.');
  for (const l of labels) {
    if (!l || l.length > 63 || /[\x00-\x20]/.test(l) || /[^\x21-\x7e]/.test(l)) throw new Error('Nom de domaine invalide');
  }
  const out = labels.reverse().map((l) => `${l}\0`).join('');
  if (out.length > 126) throw new Error('Nom de domaine trop long');
  return out;
}

const utf8 = (s: string) => utf8ToBytes(s);
function u32(n: number): Uint8Array {
  const b = new Uint8Array(4);
  b[0] = (n >>> 24) & 0xff;
  b[1] = (n >>> 16) & 0xff;
  b[2] = (n >>> 8) & 0xff;
  b[3] = n & 0xff;
  return b;
}
function u64(n: number): Uint8Array {
  // Sans `setBigUint64` (absent de certains moteurs Hermes) : deux mots de 32 bits.
  const hi = Math.floor(n / 2 ** 32);
  return new Uint8Array([...u32(hi), ...u32(n >>> 0)]);
}

/** Ce qui est signé (32 octets), pour une adresse, un domaine et un horodatage donnés. */
export function signDataDigest(payload: SignDataPayload, address: Address, domain: string, timestamp: number): Uint8Array {
  if (payload.type === 'cell') {
    const cell = beginCell()
      .storeUint(0x75569022, 32)
      .storeUint(crc32(utf8(payload.schema)), 32)
      .storeUint(timestamp, 64)
      .storeAddress(address)
      .storeStringRefTail(encodeDnsName(domain))
      .storeRef(Cell.fromBase64(payload.cell))
      .endCell();
    return new Uint8Array(cell.hash());
  }
  const data = payload.type === 'text' ? utf8(payload.text) : base64.decode(payload.bytes);
  const d = utf8(domain);
  const parts = [
    new Uint8Array([0xff, 0xff]),
    utf8('ton-connect/sign-data/'),
    u32(address.workChain >>> 0),
    new Uint8Array(address.hash),
    u32(d.length),
    d,
    u64(timestamp),
    utf8(payload.type === 'text' ? 'txt' : 'bin'),
    u32(data.length),
    data,
  ];
  const msg = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    msg.set(p, o);
    o += p.length;
  }
  return sha256(msg);
}

/** Identifiant de réseau TON Connect (global_id) : -239 réseau principal, -3 réseau de test. */
export function tonNetworkId(testnet: boolean): string {
  return testnet ? '-3' : '-239';
}
