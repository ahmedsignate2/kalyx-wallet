/**
 * Export CSV des transactions (pour compta / impôts). Fonction PURE et testable :
 * transforme des TxSummary + le contexte (symbole, décimales, réseau, explorateur)
 * en une chaîne CSV. Séparateur virgule, champs échappés (RFC 4180).
 */
import type { TxSummary } from '../chains/types';
import { formatAmount } from '../validation/amount';

export interface ChainMeta {
  name: string;
  nativeSymbol: string;
  nativeDecimals: number;
  /** Base URL de l'explorateur (ex. https://etherscan.io). */
  explorerUrl?: string;
}

export interface CsvContext {
  /** Repli : réseau affiché, quand la chaîne d'une ligne est introuvable. */
  chainName: string;
  nativeSymbol: string;
  nativeDecimals: number;
  explorerUrl?: string;
  /**
   * Réseau de CHAQUE transaction, résolu depuis `tx.chain`.
   *
   * Sans lui, toutes les lignes héritaient du réseau affiché : un export fait
   * depuis Base annonçait « Base » et « ETH » pour des transactions Bitcoin,
   * avec un lien etherscan qui ne menait nulle part, et des montants divisés par
   * 10^18 au lieu de 10^8.
   */
  chainOf?: (chain: string) => ChainMeta | undefined;
}

const HEADER = ['Date (UTC)', 'Réseau', 'Sens', 'Montant', 'Actif', 'De', 'Vers', 'Statut', 'Hash', 'Lien'];

function esc(v: string): string {
  // Échappe si le champ contient une virgule, un guillemet ou un saut de ligne.
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

const SENS: Record<TxSummary['direction'], string> = { in: 'Reçu', out: 'Envoyé', self: 'Interne' };

/**
 * Statut lisible.
 *
 * « Confirmée » était rendu pour tout ce qui n'avait pas échoué, donc aussi pour
 * une transaction encore dans le mempool. Un export comptable qui affirme une
 * confirmation qui n'a pas eu lieu est pire qu'un export incomplet.
 */
const STATUT: Record<TxSummary['status'], string> = {
  success: 'Confirmée',
  failed: 'Échouée',
  pending: 'En attente',
};

/** Une ligne CSV pour une transaction. */
function rowFor(tx: TxSummary, ctx: CsvContext): string {
  const date = new Date((tx.timestamp || 0) * 1000);
  const dateStr = Number.isNaN(date.getTime()) ? '' : date.toISOString().replace('T', ' ').slice(0, 19);

  const meta = ctx.chainOf?.(tx.chain);
  const name = meta?.name ?? ctx.chainName;
  const explorerUrl = meta?.explorerUrl ?? ctx.explorerUrl;

  /*
   * L'ACTIF DE LA TRANSACTION, pas l'unité native du réseau. Un transfert
   * d'USDC sortait libellé « ETH » et divisé par 18 décimales au lieu de 6 : le
   * montant exporté n'avait aucun rapport avec l'opération.
   */
  const symbol = tx.asset ?? meta?.nativeSymbol ?? ctx.nativeSymbol;
  const decimals = tx.decimals ?? meta?.nativeDecimals ?? ctx.nativeDecimals;
  const amount = formatAmount(tx.value, decimals);
  const link = explorerUrl ? `${explorerUrl.replace(/\/$/, '')}/tx/${tx.hash}` : '';
  return [
    dateStr,
    name,
    SENS[tx.direction],
    amount,
    symbol,
    tx.from,
    tx.to,
    STATUT[tx.status] ?? '',
    tx.hash,
    link,
  ]
    .map((c) => esc(String(c)))
    .join(',');
}

/** CSV complet (en-tête + lignes). Vide (juste l'en-tête) si aucune transaction. */
export function transactionsToCsv(txs: TxSummary[], ctx: CsvContext): string {
  const lines = [HEADER.join(','), ...txs.map((tx) => rowFor(tx, ctx))];
  return lines.join('\r\n');
}
