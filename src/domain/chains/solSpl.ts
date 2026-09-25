/**
 * Transfert de token SPL : construit le message d'une transaction qui
 * (1) crée le compte de token associé (ATA) du destinataire s'il manque —
 * variante IDEMPOTENTE, sans effet si déjà présent — puis (2) transfère le
 * montant via TransferChecked (inclut décimales + mint = plus sûr).
 *
 * DEUX programmes de jetons coexistent sur Solana : l'historique et Token-2022.
 * Le programme était figé sur l'historique, si bien qu'un mint Token-2022
 * (PYUSD et une part croissante des nouveaux jetons) était inenvoyable : l'ATA
 * était calculé avec les mauvais seeds et l'instruction visait le mauvais
 * programme. Le programme est donc un PARAMÈTRE partout où il intervient.
 */
import { getAssociatedTokenAddress } from '../../crypto/solPda';
import { buildTransactionMessage, memoIx, referenceKeys, MEMO_PROGRAM, type Instruction } from './solMessage';

export { MEMO_PROGRAM, memoIx };

export const SYSTEM_PROGRAM = '11111111111111111111111111111111';
export const TOKEN_PROGRAM = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
export const TOKEN_2022_PROGRAM = 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb';
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
export function createAtaIdempotentIx(
  payer: string,
  ata: string,
  owner: string,
  mint: string,
  tokenProgram: string = TOKEN_PROGRAM,
): Instruction {
  return {
    programId: ASSOCIATED_TOKEN_PROGRAM,
    keys: [
      { pubkey: payer, isSigner: true, isWritable: true },
      { pubkey: ata, isSigner: false, isWritable: true },
      { pubkey: owner, isSigner: false, isWritable: false },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: SYSTEM_PROGRAM, isSigner: false, isWritable: false },
      // Le programme de jetons fait partie des comptes : c'est lui qui
      // initialisera le compte créé, il doit donc correspondre au mint.
      { pubkey: tokenProgram, isSigner: false, isWritable: false },
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
  tokenProgram: string = TOKEN_PROGRAM,
  references?: string[],
): Instruction {
  // Le discriminant 12 (TransferChecked) est identique dans les deux
  // programmes : seul le programme destinataire de l'instruction change.
  return {
    programId: tokenProgram,
    keys: [
      { pubkey: source, isSigner: false, isWritable: true },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: dest, isSigner: false, isWritable: true },
      { pubkey: owner, isSigner: true, isWritable: false },
      ...referenceKeys(references),
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
  /** Programme propriétaire du mint ; par défaut le programme historique. */
  tokenProgram?: string;
  /** Repères Solana Pay, ajoutés en comptes lecture seule non signataires. */
  references?: string[];
  /** Texte inscrit on-chain via le programme SPL Memo. */
  memo?: string;
}

/** Message signable d'un transfert SPL (ATA idempotent + TransferChecked). */
export function buildSplTransferMessage(p: SplTransferParams): Uint8Array {
  const tokenProgram = p.tokenProgram ?? TOKEN_PROGRAM;
  // Le programme entre dans les SEEDS de l'ATA : une erreur ici donne une
  // adresse de compte valide mais fausse, donc un transfert dans le vide.
  const source = getAssociatedTokenAddress(p.mint, p.from, tokenProgram);
  const dest = getAssociatedTokenAddress(p.mint, p.to, tokenProgram);
  const instructions: Instruction[] = [
    ...(p.prefix ?? []),
    // Le memo précède le transfert, comme le prévoit Solana Pay.
    ...(p.memo ? [memoIx(p.memo)] : []),
    createAtaIdempotentIx(p.from, dest, p.to, p.mint, tokenProgram),
    transferCheckedIx(source, p.mint, dest, p.from, p.amount, p.decimals, tokenProgram, p.references),
  ];
  return buildTransactionMessage(p.from, p.recentBlockhash, instructions);
}
