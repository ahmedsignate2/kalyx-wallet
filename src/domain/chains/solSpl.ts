/**
 * Transfert de token SPL : construit le message d'une transaction qui
 * (1) crée le compte de token associé (ATA) du destinataire s'il manque —
 * variante IDEMPOTENTE, sans effet si déjà présent — puis (2) transfère le
 * montant via TransferChecked (inclut décimales + mint = plus sûr).
 */
import { getAssociatedTokenAddress } from '../../crypto/solPda';
import { buildTransactionMessage, type Instruction } from './solMessage';

export const SYSTEM_PROGRAM = '11111111111111111111111111111111';
export const TOKEN_PROGRAM = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
export const ASSOCIATED_TOKEN_PROGRAM = 'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL';

function u64le(value: bigint): number[] {
  const out: number[] = [];
  let v = value;
  for (let i = 0; i < 8; i++) {
    out.push(Number(v & 0xffn));
    v >>= 8n;
  }
  return out;
}

/** Instruction : créer l'ATA (idempotent) — discriminant 1. */
export function createAtaIdempotentIx(payer: string, ata: string, owner: string, mint: string): Instruction {
  return {
    programId: ASSOCIATED_TOKEN_PROGRAM,
    keys: [
      { pubkey: payer, isSigner: true, isWritable: true },
      { pubkey: ata, isSigner: false, isWritable: true },
      { pubkey: owner, isSigner: false, isWritable: false },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: SYSTEM_PROGRAM, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM, isSigner: false, isWritable: false },
    ],
    data: Uint8Array.of(1),
  };
}

/** Instruction : TransferChecked (index 12) source → dest, signée par `owner`. */
export function transferCheckedIx(
  source: string,
  mint: string,
  dest: string,
  owner: string,
  amount: bigint,
  decimals: number,
): Instruction {
  return {
    programId: TOKEN_PROGRAM,
    keys: [
      { pubkey: source, isSigner: false, isWritable: true },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: dest, isSigner: false, isWritable: true },
      { pubkey: owner, isSigner: true, isWritable: false },
    ],
    data: Uint8Array.from([12, ...u64le(amount), decimals & 0xff]),
  };
}

export interface SplTransferParams {
  from: string; // propriétaire (payeur + signataire)
  to: string; // destinataire (propriétaire du token)
  mint: string;
  amount: bigint;
  decimals: number;
  recentBlockhash: string;
  /** Instructions ComputeBudget, en tête de transaction (cf. solPriority). */
  prefix?: Instruction[];
}

/** Message signable d'un transfert SPL (ATA idempotent + TransferChecked). */
export function buildSplTransferMessage(p: SplTransferParams): Uint8Array {
  const source = getAssociatedTokenAddress(p.mint, p.from);
  const dest = getAssociatedTokenAddress(p.mint, p.to);
  const instructions: Instruction[] = [
    ...(p.prefix ?? []),
    createAtaIdempotentIx(p.from, dest, p.to, p.mint),
    transferCheckedIx(source, p.mint, dest, p.from, p.amount, p.decimals),
  ];
  return buildTransactionMessage(p.from, p.recentBlockhash, instructions);
}
