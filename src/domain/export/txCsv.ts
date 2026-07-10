/**
 * Export CSV des transactions (pour compta / impôts). Fonction PURE et testable :
 * transforme des TxSummary + le contexte (symbole, décimales, réseau, explorateur)
 * en une chaîne CSV. Séparateur virgule, champs échappés (RFC 4180).
 */
import type { TxSummary } from '../chains/types';
import { formatAmount } from '../validation/amount';

export interface CsvContext {
  chainName: string;
  nativeSymbol: string;
  nativeDecimals: number;
  /** Base URL de l'explorateur (ex. https://etherscan.io) → colonne « Lien ». */
  explorerUrl?: string;
}

const HEADER = ['Date (UTC)', 'Réseau', 'Sens', 'Montant', 'Actif', 'De', 'Vers', 'Statut', 'Hash', 'Lien'];

function esc(v: string): string {
  // Échappe si le champ contient une virgule, un guillemet ou un saut de ligne.
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

const SENS: Record<TxSummary['direction'], string> = { in: 'Reçu', out: 'Envoyé', self: 'Interne' };

/** Une ligne CSV pour une transaction. */
function rowFor(tx: TxSummary, ctx: CsvContext): string {
  const date = new Date((tx.timestamp || 0) * 1000);
  const dateStr = Number.isNaN(date.getTime()) ? '' : date.toISOString().replace('T', ' ').slice(0, 19);
  const amount = formatAmount(tx.value, ctx.nativeDecimals);
  const link = ctx.explorerUrl ? `${ctx.explorerUrl.replace(/\/$/, '')}/tx/${tx.hash}` : '';
  return [
    dateStr,
    ctx.chainName,
    SENS[tx.direction],
    amount,
    ctx.nativeSymbol,
    tx.from,
    tx.to,
    tx.status === 'failed' ? 'Échouée' : 'Confirmée',
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
