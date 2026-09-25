/**
 * Helpers PURS pour la construction d'une transaction Bitcoin : estimation de
 * la taille virtuelle (vB) et sélection des UTXO.
 *
 * Séparés de l'adapter (réseau + signature) pour être testés sans réseau.
 * Modèle UTXO : on choisit des « pièces » (sorties non dépensées) couvrant le
 * montant + les frais, avec éventuellement une sortie de « monnaie » (change).
 *
 * Les entrées sont toujours P2WPKH — c'est ce que Kalyx dérive, donc ce qu'il
 * dépense. Les SORTIES, elles, peuvent être de n'importe quel type, puisqu'on
 * envoie vers l'adresse d'un tiers.
 */
import type { BtcAddressKind } from '../validation/btcAddress';

export interface Utxo {
  txid: string;
  vout: number;
  /** Valeur en satoshis. */
  value: number;
}

export interface CoinSelection {
  inputs: Utxo[];
  /** Frais réellement payés (satoshis). */
  fee: bigint;
  /** Monnaie rendue (0 si absorbée dans les frais car sous le seuil de poussière). */
  change: bigint;
}

/** Seuil de « poussière » P2WPKH : une sortie plus petite coûte plus qu'elle ne vaut. */
export const DUST_SATS = 294n;

/** Type de la sortie de monnaie : notre propre adresse, donc toujours P2WPKH. */
export const CHANGE_KIND: BtcAddressKind = 'p2wpkh';

/**
 * Taille d'une sortie en octets, par type de script.
 *
 * 8 octets de valeur + 1 de longueur de script + le script lui-même :
 * P2PKH 25, P2SH 23, P2WPKH 22, P2WSH 34, P2TR 34.
 *
 * Ces tailles étaient toutes supposées égales à 31 (celle du P2WPKH). Envoyer
 * vers une adresse `1…` ou vers du Taproot sous-estimait donc les frais de 3 à
 * 12 octets : à 50 sat/vB, c'est jusqu'à 600 sats de moins que le taux visé, et
 * une transaction qui met plus longtemps à passer que ce qu'on a annoncé.
 */
export const OUTPUT_VBYTES: Record<BtcAddressKind, number> = {
  p2pkh: 34,
  p2sh: 32,
  p2wpkh: 31,
  p2wsh: 43,
  p2tr: 43,
};

/** Coût d'une entrée P2WPKH : 41 octets hors témoin + 27 de témoin, /4. */
const INPUT_VBYTES = 68;

/** En-tête : version 4 + locktime 4 + compteurs 2 + marqueur SegWit 2/4. */
const HEADER_VBYTES = 10.5;

/**
 * Taille virtuelle (vB) d'une transaction, arrondie au supérieur (les frais se
 * calculent sur des vB entiers).
 *
 * `outputs` liste le TYPE de chaque sortie, pas seulement leur nombre : c'est
 * ce qui permet de facturer juste vers une adresse héritée ou Taproot.
 */
export function estimateVsize(inputs: number, outputs: BtcAddressKind[]): number {
  const outBytes = outputs.reduce((sum, kind) => sum + OUTPUT_VBYTES[kind], 0);
  return Math.ceil(HEADER_VBYTES + inputs * INPUT_VBYTES + outBytes);
}

/**
 * Sélectionne les UTXO couvrant `target` sats + frais (feeRate en sat/vB).
 * Stratégie simple « plus grosses pièces d'abord » (minimise le nombre
 * d'entrées). Renvoie null si le solde est insuffisant, frais compris.
 *
 * `toKind` est le type de l'adresse du destinataire : sans lui, les frais sont
 * calculés sur une sortie P2WPKH quelle que soit la destination réelle.
 */
export function selectUtxos(
  utxos: Utxo[],
  target: bigint,
  feeRate: number,
  toKind: BtcAddressKind = 'p2wpkh',
): CoinSelection | null {
  if (target <= 0n) return null;
  const rate = Math.max(1, feeRate); // au moins 1 sat/vB
  const sorted = [...utxos].filter((u) => u.value > 0).sort((a, b) => b.value - a.value);

  const chosen: Utxo[] = [];
  let sum = 0n;
  for (const u of sorted) {
    chosen.push(u);
    sum += BigInt(u.value);

    const feeWithChange = BigInt(Math.ceil(estimateVsize(chosen.length, [toKind, CHANGE_KIND]) * rate));
    if (sum >= target + feeWithChange) {
      const change = sum - target - feeWithChange;
      if (change >= DUST_SATS) {
        return { inputs: chosen, fee: feeWithChange, change };
      }
      // Monnaie sous le seuil : pas de sortie de change, on l'absorbe en frais.
      const feeNoChange = BigInt(Math.ceil(estimateVsize(chosen.length, [toKind]) * rate));
      if (sum >= target + feeNoChange) {
        return { inputs: chosen, fee: sum - target, change: 0n };
      }
      // Sinon on continue d'accumuler des pièces.
    }
  }
  return null; // solde insuffisant
}
