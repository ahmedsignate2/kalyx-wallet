/**
 * Constructeur de message Solana « legacy » GÉNÉRAL (plusieurs instructions,
 * comptes arbitraires). Nécessaire pour les tokens SPL (créer l'ATA + transfer).
 *
 * Règles Solana : les comptes sont ordonnés en 4 blocs — signataires+écriture,
 * signataires+lecture, non-signataires+écriture, non-signataires+lecture — et
 * l'en-tête donne les compteurs qui délimitent ces blocs. Le payeur de frais
 * est toujours le compte n°0 (signataire, écriture).
 */
import { base58 } from '@scure/base';
import { encodeLength } from './solTx';

export interface AccountMeta {
  pubkey: string; // base58
  isSigner: boolean;
  isWritable: boolean;
}

export interface Instruction {
  programId: string; // base58
  keys: AccountMeta[];
  data: Uint8Array;
}

interface Merged {
  pubkey: string;
  isSigner: boolean;
  isWritable: boolean;
}

/** Sérialise le message signable d'une transaction (fee payer + instructions). */
export function buildTransactionMessage(
  feePayer: string,
  recentBlockhash: string,
  instructions: Instruction[],
): Uint8Array {
  const merged = new Map<string, Merged>();
  const touch = (pubkey: string, isSigner: boolean, isWritable: boolean) => {
    const prev = merged.get(pubkey);
    if (prev) {
      prev.isSigner = prev.isSigner || isSigner;
      prev.isWritable = prev.isWritable || isWritable;
    } else {
      merged.set(pubkey, { pubkey, isSigner, isWritable });
    }
  };

  // Le payeur de frais d'abord (signataire + écriture garantis).
  touch(feePayer, true, true);
  for (const ix of instructions) {
    for (const k of ix.keys) touch(k.pubkey, k.isSigner, k.isWritable);
    touch(ix.programId, false, false); // un programId est non-signataire, lecture seule
  }

  const all = [...merged.values()];
  const rest = all.filter((a) => a.pubkey !== feePayer);
  const writableSigners = rest.filter((a) => a.isSigner && a.isWritable);
  const readonlySigners = rest.filter((a) => a.isSigner && !a.isWritable);
  const writableNonSigners = rest.filter((a) => !a.isSigner && a.isWritable);
  const readonlyNonSigners = rest.filter((a) => !a.isSigner && !a.isWritable);

  const ordered: Merged[] = [
    merged.get(feePayer)!,
    ...writableSigners,
    ...readonlySigners,
    ...writableNonSigners,
    ...readonlyNonSigners,
  ];

  const numSigners = ordered.filter((a) => a.isSigner).length;
  const numReadonlySigned = ordered.filter((a) => a.isSigner && !a.isWritable).length;
  const numReadonlyUnsigned = ordered.filter((a) => !a.isSigner && !a.isWritable).length;

  const indexOf = new Map(ordered.map((a, i) => [a.pubkey, i]));

  const bytes: number[] = [];
  bytes.push(numSigners, numReadonlySigned, numReadonlyUnsigned);
  // Clés de comptes.
  bytes.push(...encodeLength(ordered.length));
  for (const a of ordered) {
    const key = base58.decode(a.pubkey);
    if (key.length !== 32) throw new Error(`Clé de compte invalide: ${a.pubkey}`);
    bytes.push(...key);
  }
  // Blockhash récent.
  const bh = base58.decode(recentBlockhash);
  if (bh.length !== 32) throw new Error('Blockhash invalide');
  bytes.push(...bh);
  // Instructions.
  bytes.push(...encodeLength(instructions.length));
  for (const ix of instructions) {
    bytes.push(indexOf.get(ix.programId)!);
    bytes.push(...encodeLength(ix.keys.length));
    for (const k of ix.keys) bytes.push(indexOf.get(k.pubkey)!);
    bytes.push(...encodeLength(ix.data.length));
    bytes.push(...ix.data);
  }

  return Uint8Array.from(bytes);
}
