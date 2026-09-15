/**
 * Lecture d'une transaction Solana reçue d'une dApp (WalletConnect
 * `solana_signTransaction` / navigateur) : legacy OU v0 (Address Lookup Tables),
 * base64 ou base58. On ne l'exécute pas, on la DÉCRIT : programmes appelés,
 * dApp reconnue, action probable.
 *
 * Décodage manuel du format « message » Solana (pas de @solana/web3.js ici :
 * le domaine reste pur, léger et testable) :
 *   transaction = compact-u16(nb signatures) · signatures (64 o) · message
 *   message     = [0x80|version]? · en-tête (3 o) · compact(keys 32 o) · blockhash (32 o)
 *                 · compact(instructions) · [v0 : compact(address table lookups)]
 */
import { base58, base64 } from '@scure/base';

/** Programmes connus → nom lisible et catégorie. */
export const KNOWN_SOLANA_PROGRAMS: Record<string, { name: string; kind: 'swap' | 'transfer' | 'system' | 'staking' | 'nft' | 'other' }> = {
  JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4: { name: 'Jupiter v6', kind: 'swap' },
  JUP4Fb2cqiRUcaTHdrPC8h2gNsA2ETXiPDD33WcGuJB: { name: 'Jupiter v4', kind: 'swap' },
  '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8': { name: 'Raydium AMM', kind: 'swap' },
  CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK: { name: 'Raydium CLMM', kind: 'swap' },
  whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc: { name: 'Orca Whirlpools', kind: 'swap' },
  '11111111111111111111111111111111': { name: 'System', kind: 'system' },
  TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA: { name: 'Token', kind: 'transfer' },
  TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb: { name: 'Token-2022', kind: 'transfer' },
  ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL: { name: 'Associated Token', kind: 'transfer' },
  ComputeBudget111111111111111111111111111111: { name: 'Compute Budget', kind: 'system' },
  Stake11111111111111111111111111111111111111: { name: 'Stake', kind: 'staking' },
  MarBmsSgKXdrN1egZf5sqe1TMai9K1rChYNDJgjq7aD: { name: 'Marinade', kind: 'staking' },
  Jito4APyf642JPZPx3hGc6WWJ8zPKtRbRs4P815Awbb: { name: 'Jito', kind: 'staking' },
  metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s: { name: 'Metaplex Token Metadata', kind: 'nft' },
  M2mx93ekt1fmXSVkTrUL9xVFHkmME8HTUi5Cyc5aF7K: { name: 'Magic Eden', kind: 'nft' },
};

export interface SolanaTxDescription {
  version: 'legacy' | 0;
  /** Programmes appelés (base58), dans l'ordre d'apparition. */
  programs: string[];
  /** Noms lisibles des programmes reconnus. */
  known: string[];
  /** dApp/protocole dominant si reconnu (ex. « Jupiter v6 »). */
  dapp: string | null;
  action: 'swap' | 'transfer' | 'staking' | 'nft' | 'contract';
  instructions: number;
  feePayer: string;
  /** Nombre de tables de correspondance d'adresses (v0). */
  lookupTables: number;
  /** Vrai si le payeur des frais n'est pas l'adresse attendue (signature demandée pour un autre compte). */
  feePayerMismatch?: boolean;
}

class Reader {
  private o = 0;
  constructor(private readonly b: Uint8Array) {}
  u8(): number {
    if (this.o >= this.b.length) throw new Error('eof');
    return this.b[this.o++];
  }
  bytes(n: number): Uint8Array {
    if (this.o + n > this.b.length) throw new Error('eof');
    const out = this.b.subarray(this.o, this.o + n);
    this.o += n;
    return out;
  }
  /** compact-u16 (LEB128 sur 3 octets max). */
  compact(): number {
    let len = 0;
    let size = 0;
    for (;;) {
      const e = this.u8();
      len |= (e & 0x7f) << (size * 7);
      size += 1;
      if ((e & 0x80) === 0) break;
      if (size > 3) throw new Error('compact-u16 invalide');
    }
    return len;
  }
  peek(): number {
    return this.b[this.o];
  }
}

/** Candidats d'octets : base64 puis base58 (une chaîne base58 peut ressembler à du base64 valide). */
function byteCandidates(input: string | Uint8Array): Uint8Array[] {
  if (input instanceof Uint8Array) return [input];
  const s = input.trim();
  const out: Uint8Array[] = [];
  try { out.push(base64.decode(s)); } catch { /* pas du base64 */ }
  try { out.push(base58.decode(s)); } catch { /* pas du base58 */ }
  return out;
}

/** Décode le MESSAGE (sans les signatures). */
export function parseSolanaMessage(bytes: Uint8Array): { version: 'legacy' | 0; keys: string[]; programIndexes: number[]; lookupTables: number } {
  const r = new Reader(bytes);
  let version: 'legacy' | 0 = 'legacy';
  if ((r.peek() & 0x80) !== 0) {
    const v = r.u8() & 0x7f;
    if (v !== 0) throw new Error(`version de transaction non gérée : ${v}`);
    version = 0;
  }
  r.bytes(3); // en-tête : signatures requises, lecture seule signées, lecture seule non signées
  const nKeys = r.compact();
  const keys: string[] = [];
  for (let i = 0; i < nKeys; i++) keys.push(base58.encode(r.bytes(32)));
  r.bytes(32); // blockhash récent
  const nIx = r.compact();
  const programIndexes: number[] = [];
  for (let i = 0; i < nIx; i++) {
    programIndexes.push(r.u8());
    const nAcc = r.compact();
    r.bytes(nAcc);
    const nData = r.compact();
    r.bytes(nData);
  }
  let lookupTables = 0;
  if (version === 0) {
    lookupTables = r.compact();
    for (let i = 0; i < lookupTables; i++) {
      r.bytes(32);
      r.bytes(r.compact());
      r.bytes(r.compact());
    }
  }
  return { version, keys, programIndexes, lookupTables };
}

/** Décrit une transaction sérialisée (signatures + message). Jamais ne lève : null si illisible. */
export function describeSolanaTransaction(input: string | Uint8Array, expectedFeePayer?: string): SolanaTxDescription | null {
  for (const bytes of byteCandidates(input)) {
    const d = describeBytes(bytes, expectedFeePayer);
    if (d) return d;
  }
  return null;
}

function describeBytes(bytes: Uint8Array, expectedFeePayer?: string): SolanaTxDescription | null {
  try {
    const r = new Reader(bytes);
    const nSig = r.compact();
    r.bytes(nSig * 64);
    const msg = parseSolanaMessage(bytes.subarray(nSig * 64 + compactLen(nSig)));
    const programs: string[] = [];
    for (const idx of msg.programIndexes) {
      const pid = msg.keys[idx];
      if (pid && !programs.includes(pid)) programs.push(pid);
    }
    const known = programs.map((p) => KNOWN_SOLANA_PROGRAMS[p]?.name).filter(Boolean) as string[];
    const kinds = programs.map((p) => KNOWN_SOLANA_PROGRAMS[p]?.kind).filter(Boolean);
    const dominant = programs.find((p) => ['swap', 'staking', 'nft'].includes(KNOWN_SOLANA_PROGRAMS[p]?.kind ?? ''));
    const action: SolanaTxDescription['action'] = kinds.includes('swap')
      ? 'swap'
      : kinds.includes('staking')
        ? 'staking'
        : kinds.includes('nft')
          ? 'nft'
          : kinds.length > 0 && kinds.every((k) => k === 'transfer' || k === 'system')
            ? 'transfer'
            : 'contract';
    const feePayer = msg.keys[0] ?? '';
    return {
      version: msg.version,
      programs,
      known,
      dapp: dominant ? KNOWN_SOLANA_PROGRAMS[dominant].name : null,
      action,
      instructions: msg.programIndexes.length,
      feePayer,
      lookupTables: msg.lookupTables,
      feePayerMismatch: expectedFeePayer ? feePayer !== expectedFeePayer : undefined,
    };
  } catch {
    return null;
  }
}

/** Longueur en octets de l'encodage compact-u16 de `n`. */
function compactLen(n: number): number {
  return n < 0x80 ? 1 : n < 0x4000 ? 2 : 3;
}
