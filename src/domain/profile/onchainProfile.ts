/**
 * PROFIL ON-CHAIN : ce que les réseaux disent publiquement d'un compte.
 *
 * Que des faits lus à la source : depuis quand le compte est actif (premier
 * transfert relevé par Alchemy, ou la plus ancienne signature Solana quand on
 * a TOUT l'historique), combien de transactions il a envoyées (nonce EVM,
 * compteur Bitcoin), sur combien de réseaux. Un réseau qui ne répond pas est
 * nommé, jamais compté comme vide ; une date qu'on ne connaît pas n'est pas
 * devinée.
 *
 * Les BADGES ne sont pas une note de valeur : ce sont des étapes, chacune avec
 * son critère affiché.
 */

export interface ChainActivity {
  chainId: string;
  /** Transactions envoyées (nonce EVM) ou transactions connues (Bitcoin, Solana). */
  txCount: number;
  /** `txCount` est un plancher (Solana : 1000 signatures lues, il y en a peut-être plus). */
  atLeast?: boolean;
  /** Première activité connue (ms). Absente si on ne peut pas l'établir. */
  firstAt?: number;
}

export interface OnchainProfile {
  chains: ChainActivity[];
  /** Réseaux qui n'ont pas répondu. */
  failed: string[];
  totalTx: number;
  /** Un des totaux est un plancher. */
  atLeast: boolean;
  /** Plus ancienne activité connue, tous réseaux confondus (ms). */
  firstAt?: number;
}

export type BadgeId = 'veteran' | 'multichain' | 'regular' | 'bitcoiner';

export interface Badge {
  id: BadgeId;
  earned: boolean;
}

const DAY = 86_400_000;

export function summarize(chains: ChainActivity[], failed: string[]): OnchainProfile {
  const active = chains.filter((c) => c.txCount > 0 || c.firstAt !== undefined);
  const dates = active.map((c) => c.firstAt).filter((d): d is number => typeof d === 'number' && d > 0);
  return {
    chains: active,
    failed,
    totalTx: active.reduce((s, c) => s + c.txCount, 0),
    atLeast: active.some((c) => c.atLeast),
    ...(dates.length ? { firstAt: Math.min(...dates) } : {}),
  };
}

/** Étapes franchies — chaque critère est vérifiable par l'utilisateur sur un explorateur. */
export function badgesOf(p: OnchainProfile, now = Date.now()): Badge[] {
  return [
    { id: 'veteran', earned: p.firstAt !== undefined && now - p.firstAt >= 365 * DAY },
    { id: 'multichain', earned: p.chains.length >= 3 },
    { id: 'regular', earned: p.totalTx >= 100 },
    { id: 'bitcoiner', earned: p.chains.some((c) => c.chainId === 'bitcoin' && c.txCount > 0) },
  ];
}

/** Premier transfert (`alchemy_getAssetTransfers`, ordre croissant, 1 résultat) → date (ms). */
export function parseFirstTransfer(json: unknown): number | undefined {
  const t = (json as { result?: { transfers?: { metadata?: { blockTimestamp?: unknown } }[] } } | null)?.result?.transfers?.[0];
  const ts = t?.metadata?.blockTimestamp;
  const ms = typeof ts === 'string' ? Date.parse(ts) : NaN;
  return Number.isFinite(ms) && ms > 0 ? ms : undefined;
}

/** Requête Alchemy : le plus ancien transfert envoyé (`from`) ou reçu (`to`) par `address`. */
export function firstTransferBody(address: string, side: 'from' | 'to', categories: string[]): string {
  return JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: 'alchemy_getAssetTransfers',
    params: [{ [side === 'from' ? 'fromAddress' : 'toAddress']: address, category: categories, order: 'asc', maxCount: '0x1', withMetadata: true, excludeZeroValue: false }],
  });
}

/** `getSignaturesForAddress` (Solana) : nombre lu et, si l'historique est complet, la plus ancienne date. */
export function parseSolanaSignatures(json: unknown, limit: number): Pick<ChainActivity, 'txCount' | 'atLeast' | 'firstAt'> {
  const list = Array.isArray(json) ? (json as { blockTime?: unknown }[]) : null;
  if (!list) throw new Error('Réponse Solana illisible');
  const full = list.length < limit;
  const times = list.map((s) => (typeof s?.blockTime === 'number' ? s.blockTime * 1000 : NaN)).filter((t) => Number.isFinite(t) && t > 0);
  return {
    txCount: list.length,
    ...(full ? {} : { atLeast: true }),
    // Historique tronqué : la plus ancienne signature LUE n'est pas la première. On ne la donne pas.
    ...(full && times.length ? { firstAt: Math.min(...times) } : {}),
  };
}
