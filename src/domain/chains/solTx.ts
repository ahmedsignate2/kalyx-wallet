/**
 * Transaction Solana (transfert SOL natif), sans @solana/web3.js.
 *
 * Construit manuellement un message « legacy » : en-tête, clés de comptes,
 * blockhash récent, et une instruction System Program `transfer`. La signature
 * ed25519 couvre exactement les octets du message. On évite ainsi la lourde
 * dépendance web3.js (polyfills, ESM) tout en restant 100 % testable.
 *
 * Réf format : https://solana.com/docs/core/transactions
 */
import { ed25519 } from '@noble/curves/ed25519';
import { base58, base64 } from '@scure/base';

// Le System Program est la clé publique « tout à zéro » (base58 "111…1").
const SYSTEM_PROGRAM_ID = new Uint8Array(32);
const SYSTEM_TRANSFER_INDEX = 2; // enum d'instruction System : Transfer

/** Encodage compact-u16 (shortvec) des longueurs de tableaux Solana. */
export function encodeLength(len: number): number[] {
  const out: number[] = [];
  let rem = len;
  for (;;) {
    let elem = rem & 0x7f;
    rem >>>= 7;
    if (rem === 0) {
      out.push(elem);
      break;
    }
    elem |= 0x80;
    out.push(elem);
  }
  return out;
}

function u32le(value: number): number[] {
  return [value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff];
}

function u64le(value: bigint): number[] {
  const out: number[] = [];
  let v = value;
  for (let i = 0; i < 8; i++) {
    out.push(Number(v & 0xffn));
    v >>= 8n;
  }
  return out;
}

export interface SolTransferMsg {
  from: string; // base58
  to: string; // base58
  lamports: bigint;
  recentBlockhash: string; // base58
}

/**
 * Sérialise le MESSAGE (octets signés) d'un transfert SOL.
 * Ordre des comptes : [from (signer, writable), to (writable), System (readonly)].
 */
export function buildTransferMessage({ from, to, lamports, recentBlockhash }: SolTransferMsg): Uint8Array {
  const fromKey = base58.decode(from);
  const toKey = base58.decode(to);
  const blockhash = base58.decode(recentBlockhash);
  if (fromKey.length !== 32 || toKey.length !== 32 || blockhash.length !== 32) {
    throw new Error('Clé ou blockhash Solana invalide (attendu 32 octets)');
  }

  const bytes: number[] = [];
  // En-tête : 1 signature requise, 0 readonly signé, 1 readonly non signé (System).
  bytes.push(1, 0, 1);
  // Comptes : from, to, System Program.
  bytes.push(...encodeLength(3));
  bytes.push(...fromKey, ...toKey, ...SYSTEM_PROGRAM_ID);
  // Blockhash récent.
  bytes.push(...blockhash);
  // Instructions : une seule (transfer).
  bytes.push(...encodeLength(1));
  bytes.push(2); // programIdIndex → System Program (compte n°2)
  bytes.push(...encodeLength(2), 0, 1); // comptes impliqués : from (0), to (1)
  const data = [...u32le(SYSTEM_TRANSFER_INDEX), ...u64le(lamports)];
  bytes.push(...encodeLength(data.length), ...data);

  return Uint8Array.from(bytes);
}

/**
 * Signe le message et sérialise la transaction filaire complète en base64
 * (prête pour `sendTransaction` avec encoding "base64").
 */
export function signAndSerialize(message: Uint8Array, secretKey: Uint8Array): string {
  const sig = ed25519.sign(message, secretKey); // 64 octets
  const tx: number[] = [];
  tx.push(...encodeLength(1)); // une signature
  tx.push(...sig);
  tx.push(...message);
  return base64.encode(Uint8Array.from(tx));
}
