/**
 * Parsing de l'historique Bitcoin à partir des transactions mempool.space /
 * blockstream (`/address/:addr/txs`). On calcule l'effet net sur l'adresse
 * suivie (somme des sorties reçues − somme des entrées dépensées). Pur, testable.
 */
import type { TxParsed, TxSummary } from './types';

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

/**
 * Transforme une transaction BTC en résumé du point de vue de `address`.
 *
 * `now` est injectable pour les tests : une transaction encore dans le mempool
 * n'a pas d'horodatage de bloc, et il faut bien lui en donner un.
 */
export function parseBtcTx(address: string, tx: BtcTxResponse, now = Date.now()): TxParsed | null {
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

  /*
   * UNE TRANSACTION DU MEMPOOL EST « EN ATTENTE », pas « réussie ».
   *
   * Le statut était codé en dur à `success` au motif que le mempool ne liste pas
   * d'échecs — ce qui est vrai, mais confondait « acceptée par le réseau » avec
   * « incluse dans un bloc ». L'envoi qu'on vient de diffuser s'affichait donc
   * comme confirmé. Un `status` absent est traité comme confirmé : les API le
   * renseignent, et son absence signale une réponse partielle, pas une attente.
   */
  const status: TxSummary['status'] = tx.status?.confirmed === false ? 'pending' : 'success';

  /*
   * HORODATAGE D'UNE TRANSACTION NON CONFIRMÉE. Elle n'a pas de `block_time`, et
   * le repli valait 0 — c'est-à-dire le 1er janvier 1970. Elle se retrouvait
   * donc classée tout en bas, hors des cinq lignes de l'accueil : la
   * transaction qu'on vient d'envoyer était la seule à ne pas s'afficher, et
   * l'écran Historique la datait de 1970. On prend l'instant présent, qui est la
   * meilleure approximation de sa diffusion.
   */
  const timestamp = tx.status?.block_time ?? Math.floor(now / 1000);
  const fromAddr = vin.find((i) => i.prevout?.scriptpubkey_address)?.prevout?.scriptpubkey_address ?? '';

  if (net >= 0n) {
    return { hash: tx.txid, from: fromAddr || address, to: address, value: net, timestamp, direction: net === 0n ? 'self' : 'in', status };
  }

  /*
   * MONTANT ENVOYÉ, ET NON DÉBIT NET.
   *
   * On rendait `spent - received`, soit le montant versé PLUS LES FRAIS. La
   * ligne annonce « Envoyé X à telle adresse » : X doit être ce que cette
   * adresse a reçu, sinon le montant affiché ne correspond à rien de ce que
   * l'utilisateur a demandé — un envoi de 70 000 sats se lisait 71 000. Les
   * frais ont leur place dans le détail, pas dans le montant.
   */
  const toOthers = vout.filter((o) => o.scriptpubkey_address && o.scriptpubkey_address !== address);
  const sentOut = toOthers.reduce((sum, o) => sum + BigInt(o.value ?? 0), 0n);

  /*
   * Rien n'est sorti alors que nous avons dépensé : consolidation d'UTXO. Seuls
   * les frais ont quitté le portefeuille. L'annoncer comme un envoi de la valeur
   * des frais serait trompeur — c'est un mouvement interne.
   */
  if (sentOut === 0n) {
    return { hash: tx.txid, from: address, to: address, value: received, timestamp, direction: 'self', status };
  }

  const dest = toOthers[0]?.scriptpubkey_address ?? '';
  return { hash: tx.txid, from: address, to: dest, value: sentOut, timestamp, direction: 'out', status };
}
