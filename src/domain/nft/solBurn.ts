/**
 * BRÛLER un NFT (ou un jeton) Solana indésirable et RÉCUPÉRER son loyer.
 *
 * Sur Solana, chaque jeton détenu vit dans un « compte de jeton » qui bloque
 * environ 0,002 SOL de loyer. Un NFT de spam reçu immobilise donc ce SOL chez
 * son destinataire. Deux instructions du programme de jetons le libèrent :
 *   1. Burn (8) : détruit le jeton ;
 *   2. CloseAccount (9) : ferme le compte vide et rend le loyer au propriétaire.
 *
 * Ce n'est vrai QUE sur Solana : sur Ethereum et les autres réseaux EVM, brûler
 * coûte des frais et ne rembourse rien — masquer suffit, et c'est gratuit.
 *
 * Exclus, parce que ces deux instructions échoueraient :
 *   - les NFT COMPRESSÉS : ils n'ont pas de compte de jeton (rien à récupérer) ;
 *   - les comptes GELÉS : NFT « programmables » de Metaplex, jetons gelés par
 *     leur émetteur.
 */
import { buildTransactionMessage, type Instruction } from '../chains/solMessage';
import { TOKEN_PROGRAM, TOKEN_2022_PROGRAM } from '../chains/solSpl';

/** Au plus quelques comptes par transaction : la taille d'une transaction est bornée. */
export const MAX_BURN_ACCOUNTS = 4;

function u64le(value: bigint): number[] {
  const out: number[] = [];
  let v = value;
  for (let i = 0; i < 8; i++) {
    out.push(Number(v & 0xffn));
    v >>= 8n;
  }
  return out;
}

/** Burn (8) : `amount` unités du compte `account`, signé par `owner`. */
export function burnIx(account: string, mint: string, owner: string, amount: bigint, tokenProgram: string): Instruction {
  return {
    programId: tokenProgram,
    keys: [
      { pubkey: account, isSigner: false, isWritable: true },
      { pubkey: mint, isSigner: false, isWritable: true },
      { pubkey: owner, isSigner: true, isWritable: false },
    ],
    data: Uint8Array.from([8, ...u64le(amount)]),
  };
}

/** CloseAccount (9) : ferme `account` (vide) et verse son loyer à `destination`. */
export function closeAccountIx(account: string, destination: string, owner: string, tokenProgram: string): Instruction {
  return {
    programId: tokenProgram,
    keys: [
      { pubkey: account, isSigner: false, isWritable: true },
      { pubkey: destination, isSigner: false, isWritable: true },
      { pubkey: owner, isSigner: true, isWritable: false },
    ],
    data: Uint8Array.of(9),
  };
}

/** Un compte de jeton à brûler puis fermer. */
export interface BurnAccount {
  address: string;
  /** Unités brutes détenues (souvent 1 pour un NFT, 0 pour un compte déjà vide). */
  amount: bigint;
  tokenProgram: string;
  /** Loyer rendu à la fermeture, en lamports. */
  lamports: bigint;
}

export interface BurnTarget {
  mint: string;
  accounts: BurnAccount[];
  /** Total rendu au propriétaire, en lamports. */
  rentLamports: bigint;
}

/** Pourquoi un jeton ne peut pas être brûlé ici. */
export type BurnRefusal = 'notFound' | 'frozen' | 'unsupportedProgram';

interface RawTokenAccount {
  pubkey?: string;
  account?: {
    lamports?: number;
    owner?: string;
    data?: { parsed?: { info?: { mint?: string; owner?: string; state?: string; tokenAmount?: { amount?: string } } } };
  };
}

/**
 * Lit la réponse de `getTokenAccountsByOwner(owner, { mint })` (jsonParsed).
 * Vérifie tout ce dont la transaction dépend : le compte appartient bien au
 * propriétaire et au mint, il n'est pas gelé, son programme est un programme
 * de jetons connu.
 */
export function parseBurnTarget(value: unknown, owner: string, mint: string): BurnTarget | BurnRefusal {
  const list = Array.isArray(value) ? (value as RawTokenAccount[]) : [];
  const accounts: BurnAccount[] = [];
  for (const a of list) {
    const info = a?.account?.data?.parsed?.info;
    const program = a?.account?.owner ?? '';
    if (!a?.pubkey || !info || info.mint !== mint || info.owner !== owner) continue;
    if (info.state === 'frozen') return 'frozen';
    if (program !== TOKEN_PROGRAM && program !== TOKEN_2022_PROGRAM) return 'unsupportedProgram';
    const raw = info.tokenAmount?.amount;
    if (typeof raw !== 'string' || !/^\d+$/.test(raw)) continue;
    accounts.push({ address: a.pubkey, amount: BigInt(raw), tokenProgram: program, lamports: BigInt(Math.max(0, Math.floor(a.account?.lamports ?? 0))) });
  }
  if (!accounts.length) return 'notFound';
  const kept = accounts.slice(0, MAX_BURN_ACCOUNTS);
  return { mint, accounts: kept, rentLamports: kept.reduce((s, a) => s + a.lamports, 0n) };
}

/** Message signable : pour chaque compte, Burn (s'il reste des unités) puis CloseAccount. */
export function buildBurnMessage(owner: string, target: BurnTarget, recentBlockhash: string, prefix: Instruction[] = []): Uint8Array {
  const ixs: Instruction[] = [...prefix];
  for (const a of target.accounts) {
    if (a.amount > 0n) ixs.push(burnIx(a.address, target.mint, owner, a.amount, a.tokenProgram));
    ixs.push(closeAccountIx(a.address, owner, owner, a.tokenProgram));
  }
  return buildTransactionMessage(owner, recentBlockhash, ixs);
}
