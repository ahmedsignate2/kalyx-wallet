/**
 * Parseur de la réponse "txlist" d'une API type Etherscan/Blockscout.
 *
 * Isolé et testé : la logique de normalisation ne dépend pas du réseau. Le fetch
 * réseau (dans EvmChainAdapter) est volontairement séparé pour rester testable.
 */
import type { TxSummary } from './types';

interface RawTx {
  hash: string;
  from: string;
  to: string;
  value: string; // wei en décimal
  timeStamp: string; // unix (secondes) en décimal
  isError?: string; // "0" ok, "1" erreur
  txreceipt_status?: string; // "1" success, "0" failed
}

interface EtherscanResponse {
  status: string; // "1" ok, "0" pas de résultat / erreur
  message?: string;
  result?: RawTx[] | string;
}

/** Direction d'un transfert vis-à-vis de l'adresse du propriétaire. */
function directionOf(from: string, to: string, owner: string): TxSummary['direction'] {
  const o = owner.toLowerCase();
  const f = from.toLowerCase();
  const t = (to || '').toLowerCase();
  if (f === o && t === o) return 'self';
  if (f === o) return 'out';
  return 'in';
}

/**
 * Transforme la réponse brute en TxSummary[]. Robuste : si la réponse est une
 * erreur (clé API manquante, rate limit) ou malformée, renvoie [].
 */
export function parseTxList(json: unknown, ownerAddress: string): TxSummary[] {
  const resp = json as EtherscanResponse;
  if (!resp || !Array.isArray(resp.result)) return [];

  return resp.result
    .filter((r) => r && typeof r.hash === 'string')
    .map((r) => {
      let value: bigint;
      try {
        value = BigInt(r.value ?? '0');
      } catch {
        value = 0n;
      }
      const failed = r.isError === '1' || r.txreceipt_status === '0';
      return {
        hash: r.hash,
        from: r.from,
        to: r.to,
        value,
        timestamp: Number(r.timeStamp) || 0,
        direction: directionOf(r.from, r.to, ownerAddress),
        status: failed ? ('failed' as const) : ('success' as const),
      };
    });
}
