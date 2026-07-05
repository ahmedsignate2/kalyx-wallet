/**
 * Parsing de l'historique Bitcoin à partir des transactions mempool.space /
 * blockstream (`/address/:addr/txs`). On calcule l'effet net sur l'adresse
 * suivie (somme des sorties reçues − somme des entrées dépensées). Pur, testable.
 */
import type { TxSummary } from './types';

export interface BtcVin {
  prevout?: { scriptpubkey_address?: string; value?: number } | null;
}
export interface BtcVout {
  scriptpubkey_address?: string;
  value?: number;
}
export interface BtcTxResponse {
  txid: string;
  status?: { confirmed?: boolean; block_time?: number };
  vin?: BtcVin[];
  vout?: BtcVout[];
}

/** Transforme une transaction BTC en TxSummary du point de vue de `address`. */
export function parseBtcTx(address: string, tx: BtcTxResponse): TxSummary | null {
  if (!tx.txid) return null;
  const vin = tx.vin ?? [];
  const vout = tx.vout ?? [];

  let spent = 0n; // entrées provenant de notre adresse
  for (const i of vin) {
    if (i.prevout?.scriptpubkey_address === address) spent += BigInt(i.prevout.value ?? 0);
  }
  let received = 0n; // sorties vers notre adresse
  for (const o of vout) {
    if (o.scriptpubkey_address === address) received += BigInt(o.value ?? 0);
  }
  if (spent === 0n && received === 0n) return null; // adresse non impliquée

  const net = received - spent; // satoshis
  const timestamp = tx.status?.block_time ?? 0;
  const status: TxSummary['status'] = 'success'; // mempool ne liste pas d'échecs
  const fromAddr = vin.find((i) => i.prevout?.scriptpubkey_address)?.prevout?.scriptpubkey_address ?? '';

  if (net >= 0n) {
    return { hash: tx.txid, from: fromAddr || address, to: address, value: net, timestamp, direction: net === 0n ? 'self' : 'in', status };
  }
  // Envoi : bénéficiaire = 1re sortie qui n'est pas notre adresse (hors monnaie rendue).
  const dest = vout.find((o) => o.scriptpubkey_address && o.scriptpubkey_address !== address)?.scriptpubkey_address ?? '';
  return { hash: tx.txid, from: address, to: dest, value: -net, timestamp, direction: 'out', status };
}
