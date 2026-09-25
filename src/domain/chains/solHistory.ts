/**
 * Parsing de l'historique Solana à partir des réponses `getTransaction`
 * (encoding jsonParsed). Pur et testable.
 *
 * TROU CORRIGÉ. Seuls `preBalances`/`postBalances` étaient lus — c'est-à-dire
 * les LAMPORTS. Les transferts de jetons, eux, n'y apparaissent presque pas :
 * envoyer 100 USDC produisait une ligne d'historique à ~0 SOL, dont le
 * « destinataire » était le compte ayant le plus gagné en lamports, souvent le
 * bénéficiaire du loyer d'un compte créé. L'utilisateur voyait une entrée
 * fantôme à la place de son paiement.
 *
 * On lit donc AUSSI `preTokenBalances`/`postTokenBalances`, et le mouvement de
 * jeton l'emporte quand il y en a un : c'est lui que l'utilisateur a voulu.
 */
import type { TxParsed, TxSummary } from './types';
import { KNOWN_MINTS } from '../tokens/splTokens';

export interface SolTxAccount {
  pubkey: string;
  signer?: boolean;
  writable?: boolean;
}

/** Entrée de `pre/postTokenBalances` (encoding jsonParsed). */
export interface SolTokenBalance {
  accountIndex?: number;
  mint?: string;
  /** Propriétaire du compte de jeton — pas le compte lui-même. */
  owner?: string;
  programId?: string;
  uiTokenAmount?: { amount?: string; decimals?: number };
}

export interface SolTxResponse {
  slot?: number;
  blockTime?: number | null;
  meta?: {
    err?: unknown;
    fee?: number;
    preBalances?: number[];
    postBalances?: number[];
    preTokenBalances?: SolTokenBalance[];
    postTokenBalances?: SolTokenBalance[];
  } | null;
  transaction?: {
    message?: { accountKeys?: SolTxAccount[] };
    signatures?: string[];
  };
}

interface TokenDelta {
  mint: string;
  decimals: number;
  /** Variation du solde de `address` pour ce mint, en unités de base. */
  delta: bigint;
}

/** Variation de solde par mint, pour le propriétaire suivi. */
function tokenDeltas(address: string, tx: SolTxResponse): TokenDelta[] {
  const pre = tx.meta?.preTokenBalances ?? [];
  const post = tx.meta?.postTokenBalances ?? [];
  if (pre.length === 0 && post.length === 0) return [];

  /*
   * Clé = compte de jeton (accountIndex), pas le mint : un propriétaire peut
   * détenir plusieurs comptes pour un même mint, et les additionner donne le
   * mouvement réel de son solde.
   */
  const amounts = new Map<string, { mint: string; decimals: number; pre: bigint; post: bigint }>();
  const visit = (list: SolTokenBalance[], side: 'pre' | 'post') => {
    for (const b of list) {
      if (b?.owner !== address) continue;
      const mint = b.mint;
      const raw = b.uiTokenAmount?.amount;
      const decimals = b.uiTokenAmount?.decimals;
      if (!mint || raw == null || decimals == null) continue;
      let value: bigint;
      try {
        value = BigInt(raw);
      } catch {
        continue;
      }
      const key = `${b.accountIndex ?? -1}:${mint}`;
      const entry = amounts.get(key) ?? { mint, decimals, pre: 0n, post: 0n };
      entry[side] = value;
      amounts.set(key, entry);
    }
  };
  visit(pre, 'pre');
  visit(post, 'post');

  const byMint = new Map<string, TokenDelta>();
  for (const e of amounts.values()) {
    const d = byMint.get(e.mint) ?? { mint: e.mint, decimals: e.decimals, delta: 0n };
    d.delta += e.post - e.pre;
    byMint.set(e.mint, d);
  }
  return [...byMint.values()].filter((d) => d.delta !== 0n);
}

/** Propriétaire dont le solde de `mint` a varié en sens inverse de `delta`. */
function tokenCounterparty(address: string, tx: SolTxResponse, mint: string, delta: bigint): string | null {
  const pre = tx.meta?.preTokenBalances ?? [];
  const post = tx.meta?.postTokenBalances ?? [];
  const byOwner = new Map<string, bigint>();
  const visit = (list: SolTokenBalance[], sign: bigint) => {
    for (const b of list) {
      if (b?.mint !== mint || !b.owner || b.owner === address) continue;
      const raw = b.uiTokenAmount?.amount;
      if (raw == null) continue;
      try {
        byOwner.set(b.owner, (byOwner.get(b.owner) ?? 0n) + sign * BigInt(raw));
      } catch {
        /* montant illisible : on ignore ce compte */
      }
    }
  };
  visit(pre, -1n);
  visit(post, 1n);

  // Celui qui a le plus varié dans le sens OPPOSÉ au nôtre.
  let best: string | null = null;
  let bestMove = 0n;
  for (const [owner, move] of byOwner) {
    const opposite = delta > 0n ? -move : move;
    if (opposite > bestMove) {
      bestMove = opposite;
      best = owner;
    }
  }
  return best;
}

/**
 * Transforme une transaction Solana en TxSummary du point de vue de `address`.
 * Renvoie null si l'adresse n'apparaît pas ou si la structure est incomplète.
 */
export function parseSolanaTx(address: string, tx: SolTxResponse): TxParsed | null {
  const keys = tx.transaction?.message?.accountKeys;
  const pre = tx.meta?.preBalances;
  const post = tx.meta?.postBalances;
  const sig = tx.transaction?.signatures?.[0];
  if (!keys || !pre || !post || !sig) return null;

  const idx = keys.findIndex((k) => k.pubkey === address);
  if (idx < 0 || idx >= pre.length || idx >= post.length) return null;

  const fee = BigInt(tx.meta?.fee ?? 0);
  const delta = BigInt(post[idx]) - BigInt(pre[idx]); // lamports
  const payer = keys[0]?.pubkey ?? address;
  const status: TxSummary['status'] = tx.meta?.err ? 'failed' : 'success';
  const timestamp = tx.blockTime ?? 0;

  /*
   * MOUVEMENT DE JETON D'ABORD. S'il y en a un, c'est celui que l'utilisateur a
   * voulu : le delta en lamports ne reflète alors que les frais et le loyer d'un
   * éventuel compte créé, soit une ligne à ~0 SOL et un destinataire arbitraire.
   */
  const deltas = tokenDeltas(address, tx);
  if (deltas.length > 0) {
    // Le plus gros mouvement en valeur absolue : sur un échange il y en a deux,
    // et c'est celui-là qui décrit le mieux l'opération.
    const main = deltas.reduce((a, b) => (abs(b.delta) > abs(a.delta) ? b : a));
    const other = tokenCounterparty(address, tx, main.mint, main.delta);
    const known = KNOWN_MINTS[main.mint];
    return {
      hash: sig,
      from: main.delta > 0n ? other ?? payer : address,
      to: main.delta > 0n ? address : other ?? main.mint,
      value: abs(main.delta),
      timestamp,
      direction: main.delta > 0n ? 'in' : 'out',
      status,
      // Deux jetons qui bougent = un échange, pas un simple transfert.
      type: deltas.length > 1 ? 'SWAP' : 'TRANSFER',
      asset: known?.symbol ?? `${main.mint.slice(0, 4)}…`,
      decimals: main.decimals,
    };
  }

  let direction: TxSummary['direction'];
  let from: string;
  let to: string;
  let value: bigint;

  if (delta > 0n) {
    direction = 'in';
    from = payer;
    to = address;
    value = delta;
  } else if (delta < 0n) {
    direction = 'out';
    from = address;
    // Bénéficiaire = compte ayant le plus gagné (hors nous).
    let best = -1;
    let bestGain = 0n;
    for (let i = 0; i < keys.length; i++) {
      if (i === idx) continue;
      const g = BigInt(post[i] ?? 0) - BigInt(pre[i] ?? 0);
      if (g > bestGain) {
        bestGain = g;
        best = i;
      }
    }
    to = best >= 0 ? keys[best].pubkey : (keys[1]?.pubkey ?? address);
    // Si on est le payeur, le montant réel exclut les frais.
    value = -delta - (idx === 0 ? fee : 0n);
    if (value < 0n) value = -delta;
  } else {
    direction = 'self';
    from = address;
    to = address;
    value = 0n;
  }

  return { hash: sig, from, to, value, timestamp, direction, status };
}

function abs(v: bigint): bigint {
  return v < 0n ? -v : v;
}
