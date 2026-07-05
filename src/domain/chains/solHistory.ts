/**
 * Parsing de l'historique Solana à partir des réponses `getTransaction`
 * (encoding jsonParsed). On calcule le delta de solde de l'adresse suivie
 * (pré/post balances) pour en déduire montant + sens. Pur et testable.
 */
import type { TxSummary } from './types';

export interface SolTxAccount {
  pubkey: string;
  signer?: boolean;
  writable?: boolean;
}

export interface SolTxResponse {
  slot?: number;
  blockTime?: number | null;
  meta?: {
    err?: unknown;
    fee?: number;
    preBalances?: number[];
    postBalances?: number[];
  } | null;
  transaction?: {
    message?: { accountKeys?: SolTxAccount[] };
    signatures?: string[];
  };
}

/**
 * Transforme une transaction Solana en TxSummary du point de vue de `address`.
 * Renvoie null si l'adresse n'apparaît pas ou si la structure est incomplète.
 */
export function parseSolanaTx(address: string, tx: SolTxResponse): TxSummary | null {
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
