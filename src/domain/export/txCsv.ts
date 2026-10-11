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
  /** Libellés dans la langue de l'utilisateur ; sans eux, le français. */
  labels?: CsvLabels;
}

/** Textes du fichier : en-tête, sens et statut de chaque ligne. */
export interface CsvLabels {
  header: readonly [string, string, string, string, string, string, string, string, string, string];
  directions: Record<TxSummary['direction'], string>;
  statuses: Record<TxSummary['status'], string>;
  swap: string;
  approval: string;
  contractCall: string;
}

const HEADER = ['Date (UTC)', 'Réseau', 'Sens', 'Montant', 'Actif', 'De', 'Vers', 'Statut', 'Hash', 'Lien'] as const;

function esc(v: string): string {
  /*
   * INJECTION DE FORMULE. Le nom d'un jeton vient de son contrat : un jeton
   * spam peut s'appeler « =HYPERLINK(…) ». Ouvert dans Excel ou Sheets, ce
   * champ deviendrait une formule. Un champ qui commence par = + @ (ou une
   * tabulation, un retour chariot, un « - » qui n'est pas un nombre) est donc
   * préfixé d'une apostrophe : il reste du texte.
   */
  if (/^[=+@\t\r]/.test(v) || (v.startsWith('-') && !/^-\d+([.,]\d+)?$/.test(v))) v = `'${v}`;
  // Échappe si le champ contient une virgule, un guillemet ou un saut de ligne.
  return /[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
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

const FR_LABELS: CsvLabels = {
  header: HEADER,
  directions: SENS,
  statuses: STATUT,
  swap: 'Échange',
  approval: 'Approbation',
  contractCall: 'Interaction contrat',
};

/** Une ligne CSV pour une transaction. */
function rowFor(tx: TxSummary, ctx: CsvContext): string {
  // Date inconnue (indexeur sans horodatage) : case VIDE, jamais « 1970-01-01 ».
  const date = new Date((tx.timestamp || 0) * 1000);
  const dateStr = !tx.timestamp || Number.isNaN(date.getTime()) ? '' : date.toISOString().replace('T', ' ').slice(0, 19);

  const L = ctx.labels ?? FR_LABELS;
  const meta = ctx.chainOf?.(tx.chain);
  const name = meta?.name ?? ctx.chainName;
  const explorerUrl = meta?.explorerUrl ?? ctx.explorerUrl;

  /*
   * L'ACTIF DE LA TRANSACTION, pas l'unité native du réseau. Un transfert
   * d'USDC sortait libellé « ETH » et divisé par 18 décimales au lieu de 6 : le
   * montant exporté n'avait aucun rapport avec l'opération.
   */
  let symbol = tx.asset ?? meta?.nativeSymbol ?? ctx.nativeSymbol;
  const decimals = tx.decimals ?? meta?.nativeDecimals ?? ctx.nativeDecimals;
  let amount = formatAmount(tx.value, decimals);
  let sens = L.directions[tx.direction];
  /*
   * NATURE DE L'OPÉRATION, comme dans l'écran d'activité (src/domain/tx/humanize.ts).
   * Un NFT sortait en « 1 ? » (collection sans nom), un appel de contrat à 0 en
   * « Envoyé 0.0 », une approbation comme un envoi.
   */
  const type = (tx.type ?? '').toUpperCase();
  if (type === 'NFT') {
    sens = `${tx.direction === 'in' ? L.directions.in : L.directions.out} (NFT)`;
    amount = tx.value > 1n ? tx.value.toString() : '1';
    symbol = `${tx.asset && tx.asset !== '?' ? tx.asset : 'NFT'}${tx.tokenId ? ` #${tx.tokenId}` : ''}`;
  } else if (type === 'SWAP') {
    sens = L.swap;
  } else if (type === 'APPROVE' || type === 'APPROVAL') {
    sens = L.approval;
  } else if (tx.value === 0n && tx.direction !== 'in' && type !== 'TRANSFER') {
    sens = L.contractCall;
    amount = '0';
  }
  const link = explorerUrl ? `${explorerUrl.replace(/\/$/, '')}/tx/${tx.hash}` : '';
  return [
    dateStr,
    name,
    sens,
    amount,
    symbol,
    tx.from,
    tx.to,
    L.statuses[tx.status] ?? '',
    tx.hash,
    link,
  ]
    .map((c) => esc(String(c)))
    .join(',');
}

/** CSV complet (en-tête + lignes). Vide (juste l'en-tête) si aucune transaction. */
export function transactionsToCsv(txs: TxSummary[], ctx: CsvContext): string {
  const lines = [(ctx.labels ?? FR_LABELS).header.map(esc).join(','), ...txs.map((tx) => rowFor(tx, ctx))];
  return lines.join('\r\n');
}
