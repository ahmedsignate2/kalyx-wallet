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
import { buildTransactionMessage, memoIx, referenceKeys, type Instruction } from './solMessage';

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

export const SYSTEM_PROGRAM_BASE58 = '11111111111111111111111111111111';

export interface SolTransferMsg {
  from: string; // base58
  to: string; // base58
  lamports: bigint;
  recentBlockhash: string; // base58
  /**
   * Instructions à placer AVANT le transfert — en pratique les deux
   * instructions ComputeBudget (cf. solPriority). En tête parce que c'est la
   * convention, et parce que le budget doit être fixé avant d'être consommé.
   */
  prefix?: Instruction[];
  /** Repères Solana Pay, en comptes lecture seule non signataires. */
  references?: string[];
  /** Texte inscrit on-chain via le programme SPL Memo. */
  memo?: string;
}

/**
 * Instruction System `transfer` : from → to, `lamports`.
 *
 * `references` ajoute les repères Solana Pay en comptes NON signataires et en
 * LECTURE SEULE : sans effet sur le transfert, ils permettent au marchand de
 * retrouver la transaction.
 */
export function systemTransferIx(
  from: string,
  to: string,
  lamports: bigint,
  references?: string[],
): Instruction {
  return {
    programId: SYSTEM_PROGRAM_BASE58,
    keys: [
      { pubkey: from, isSigner: true, isWritable: true },
      { pubkey: to, isSigner: false, isWritable: true },
      ...referenceKeys(references),
    ],
    data: Uint8Array.from([...u32le(SYSTEM_TRANSFER_INDEX), ...u64le(lamports)]),
  };
}

/**
 * Sérialise le MESSAGE (octets signés) d'un transfert SOL.
 *
 * Délègue au constructeur général plutôt que d'assembler les octets à la main :
 * c'est le seul moyen d'ajouter les instructions ComputeBudget sans réécrire
 * l'en-tête et l'ordre des comptes, que Solana impose en quatre blocs. Sans
 * `prefix`, la sortie est identique octet pour octet à l'ancienne version —
 * l'ordre [payeur, destinataire, System] et l'en-tête [1, 0, 1] en découlent.
 */
export function buildTransferMessage({
  from,
  to,
  lamports,
  recentBlockhash,
  prefix = [],
  references,
  memo,
}: SolTransferMsg): Uint8Array {
  // Validation explicite : le constructeur général signale une clé invalide,
  // mais ce message-ci a un contrat plus ancien et plus précis.
  for (const [label, key] of [['clé', from], ['clé', to], ['blockhash', recentBlockhash]] as const) {
    let len = 0;
    try {
      len = base58.decode(key).length;
    } catch {
      throw new Error(`Clé ou blockhash Solana invalide (attendu 32 octets, ${label})`);
    }
    if (len !== 32) throw new Error('Clé ou blockhash Solana invalide (attendu 32 octets)');
  }

  return buildTransactionMessage(from, recentBlockhash, [
    ...prefix,
    // Le memo précède le transfert, comme le prévoit Solana Pay.
    ...(memo ? [memoIx(memo)] : []),
    systemTransferIx(from, to, lamports, references),
  ]);
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
