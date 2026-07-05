/**
 * Tokens SPL (équivalent Solana des ERC-20).
 *
 * Les comptes de tokens sont lus via `getTokenAccountsByOwner` (jsonParsed).
 * Le solde et le mint sont on-chain ; le symbole/nom ne le sont pas dans le
 * compte de token → on s'appuie sur une petite table des mints répandus
 * (approche curée, comme pour le swap EVM), avec repli sur le mint tronqué.
 */
export const SPL_TOKEN_PROGRAM = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
export const SPL_TOKEN_2022_PROGRAM = 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb';

interface KnownMint {
  symbol: string;
  name: string;
  logo?: string;
}

const CG = 'https://assets.coingecko.com/coins/images';

/** Mints SPL répandus (mainnet). */
export const KNOWN_MINTS: Record<string, KnownMint> = {
  EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v: { symbol: 'USDC', name: 'USD Coin', logo: `${CG}/6319/small/usdc.png` },
  Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB: { symbol: 'USDT', name: 'Tether USD', logo: `${CG}/325/small/Tether.png` },
  JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN: { symbol: 'JUP', name: 'Jupiter', logo: `${CG}/34188/small/jup.png` },
  DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263: { symbol: 'BONK', name: 'Bonk', logo: `${CG}/28600/small/bonk.jpg` },
  EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm: { symbol: 'WIF', name: 'dogwifhat', logo: `${CG}/33566/small/dogwifhat.jpg` },
  J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn: { symbol: 'JitoSOL', name: 'Jito Staked SOL' },
  mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So: { symbol: 'mSOL', name: 'Marinade Staked SOL' },
  '4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R': { symbol: 'RAY', name: 'Raydium' },
  HZ1JovNiVvGrGNiiYvEozEVgZ58xaU3RKwX8eACQBCt3: { symbol: 'PYTH', name: 'Pyth Network' },
  jtojtomepa8beP8AuQc6eXt5FriJwfFMwQx2v2f9mCL: { symbol: 'JTO', name: 'Jito' },
};

export interface SplToken {
  mint: string;
  ata: string; // adresse du compte de token associé
  raw: bigint;
  decimals: number;
  symbol: string;
  name: string;
  logo?: string;
}

interface RawTokenAccount {
  pubkey?: string;
  account?: {
    data?: {
      parsed?: {
        info?: {
          mint?: string;
          tokenAmount?: { amount?: string; decimals?: number };
        };
      };
    };
  };
}

/** Parse la réponse getTokenAccountsByOwner → liste de tokens SPL non nuls. */
export function parseTokenAccounts(value: RawTokenAccount[] | null | undefined): SplToken[] {
  if (!Array.isArray(value)) return [];
  const out: SplToken[] = [];
  for (const acc of value) {
    const info = acc?.account?.data?.parsed?.info;
    const mint = info?.mint;
    const amount = info?.tokenAmount?.amount;
    const decimals = info?.tokenAmount?.decimals;
    if (!mint || amount == null || decimals == null) continue;
    const raw = BigInt(amount);
    if (raw === 0n) continue; // on masque les comptes vides
    const known = KNOWN_MINTS[mint];
    out.push({
      mint,
      ata: acc.pubkey ?? '',
      raw,
      decimals,
      symbol: known?.symbol ?? `${mint.slice(0, 4)}…`,
      name: known?.name ?? 'Token SPL',
      logo: known?.logo,
    });
  }
  // Soldes les plus élevés d'abord (heuristique simple, sans prix).
  return out.sort((a, b) => (b.raw > a.raw ? 1 : b.raw < a.raw ? -1 : 0));
}
