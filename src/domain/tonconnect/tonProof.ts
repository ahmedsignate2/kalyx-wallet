/**
 * TON Connect — réponse de connexion : `ton_addr` et `ton_proof`.
 *
 * `ton_proof`, disposition des octets (spec `connect.md`, « Address proof
 * signature ») :
 *
 *   message   = "ton-proof-item-v2/" ++ workchain (int32 BE) ++ hash (32)
 *               ++ longueur du domaine (uint32 LE) ++ domaine (UTF-8)
 *               ++ horodatage (uint64 LE, secondes) ++ payload (UTF-8)
 *   signature = Ed25519(sha256(0xffff ++ "ton-connect" ++ sha256(message)))
 *
 * La signature passe par un `sign(bytes)` fourni par l'appelant : la clé ne
 * quitte jamais le magasin, comme pour un transfert.
 */
import { sha256 } from '@noble/hashes/sha256';
import { utf8ToBytes } from '@noble/hashes/utils';
import { base64 } from '@scure/base';
import { parseTonAddress, parseRawTonAddress, toRawTonAddress } from '../chains/ton/tonAddress';

const PREFIX = utf8ToBytes('ton-proof-item-v2/');
const CONNECT = utf8ToBytes('ton-connect');

export const TON_MAINNET_ID = '-239';
export const TON_TESTNET_ID = '-3';

function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

/** Octets signés (avant les deux sha256), exposés pour les tests. */
export function tonProofMessage(address: string, domain: string, timestamp: number, payload: string): Uint8Array {
  const a = parseTonAddress(address) ?? parseRawTonAddress(address.toLowerCase());
  if (!a) throw new Error('Adresse TON invalide');
  const wc = new Uint8Array(4);
  new DataView(wc.buffer).setInt32(0, a.workchain, false);
  const d = utf8ToBytes(domain);
  const len = new Uint8Array(4);
  new DataView(len.buffer).setUint32(0, d.length, true);
  // Octet par octet, pas `DataView.setBigUint64` : incertain sous Hermes, et
  // une exception ici faisait échouer toute connexion avec preuve (STON.fi).
  const ts = new Uint8Array(8);
  let rest = BigInt(timestamp);
  for (let i = 0; i < 8; i++) {
    ts[i] = Number(rest & 0xffn);
    rest >>= 8n;
  }
  return concat(PREFIX, wc, a.hash, len, d, ts, utf8ToBytes(payload));
}

/** Ce qui est réellement signé en ed25519. */
export function tonProofDigest(message: Uint8Array): Uint8Array {
  return sha256(concat(new Uint8Array([0xff, 0xff]), CONNECT, sha256(message)));
}

export interface TonProofReply {
  name: 'ton_proof';
  proof: { timestamp: number; domain: { lengthBytes: number; value: string }; payload: string; signature: string };
}

export async function buildTonProof(
  p: { address: string; domain: string; payload: string; timestamp: number },
  sign: (digest: Uint8Array) => Promise<Uint8Array> | Uint8Array,
): Promise<TonProofReply> {
  const signature = await sign(tonProofDigest(tonProofMessage(p.address, p.domain, p.timestamp, p.payload)));
  if (signature.length !== 64) throw new Error('Signature ed25519 de 64 octets attendue');
  return {
    name: 'ton_proof',
    proof: {
      timestamp: p.timestamp,
      domain: { lengthBytes: utf8ToBytes(p.domain).length, value: p.domain },
      payload: p.payload,
      signature: base64.encode(signature),
    },
  };
}

export interface TonAddrReply {
  name: 'ton_addr';
  address: string;
  network: string;
  publicKey: string;
  walletStateInit: string;
}

export function tonAddrReply(p: { address: string; testnet: boolean; publicKeyHex: string; stateInitBoc: string }): TonAddrReply {
  const a = parseTonAddress(p.address) ?? parseRawTonAddress(p.address.toLowerCase());
  if (!a) throw new Error('Adresse TON invalide');
  return {
    name: 'ton_addr',
    // La spec veut l'adresse BRUTE (`0:…`).
    address: toRawTonAddress(a),
    network: p.testnet ? TON_TESTNET_ID : TON_MAINNET_ID,
    publicKey: p.publicKeyHex.toLowerCase(),
    walletStateInit: p.stateInitBoc,
  };
}
