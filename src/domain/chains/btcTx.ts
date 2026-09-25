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

/**
 * Seuils de « poussière », PAR TYPE de sortie.
 *
 * Bitcoin Core refuse de relayer une transaction portant une sortie dont la
 * valeur ne couvrirait pas trois fois le coût de sa dépense : elle est
 * « non standard » et aucun nœud ne la propage. Le seuil dépend de la taille du
 * script, donc du type d'adresse.
 *
 * Une seule constante était utilisée, celle du P2WPKH (294). Depuis qu'on
 * envoie aussi vers des adresses héritées (546) et Taproot (330), ce seuil
 * unique est trop bas pour elles — et il n'était de toute façon appliqué qu'à la
 * MONNAIE, jamais à la sortie du destinataire.
 */
export const DUST_BY_KIND: Record<BtcAddressKind, bigint> = {
  p2pkh: 546n,
  p2sh: 540n,
  p2wpkh: 294n,
  p2wsh: 330n,
  p2tr: 330n,
};

/** Seuil de poussière de NOTRE sortie de monnaie (toujours P2WPKH). */
export const DUST_SATS = DUST_BY_KIND.p2wpkh;

/** Seuil de poussière applicable à une sortie de ce type. */
export function dustThreshold(kind: BtcAddressKind): bigint {
  return DUST_BY_KIND[kind];
}

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
/**
 * Nombre maximal d'entrées retenues.
 *
 * Deux raisons. Une transaction au-delà de 100 000 vB est NON STANDARD et aucun
 * nœud ne la relaie : à 68 vB par entrée, on s'en approcherait vers 1 400
 * entrées. Et bien avant ça, une transaction à plusieurs centaines d'entrées
 * coûte davantage en frais qu'elle ne transporte. 200 laisse une marge
 * confortable tout en gardant la transaction relayable.
 */
export const MAX_INPUTS = 200;

/**
 * Sélectionne les UTXO couvrant `target` sats + frais (feeRate en sat/vB).
 *
 * Renvoie null si le solde est insuffisant frais compris, si la sortie du
 * destinataire serait de la poussière, ou s'il faudrait plus d'entrées que
 * `MAX_INPUTS`.
 */
export function selectUtxos(
  utxos: Utxo[],
  target: bigint,
  feeRate: number,
  toKind: BtcAddressKind = 'p2wpkh',
): CoinSelection | null {
  if (target <= 0n) return null;
  /*
   * Sortie du destinataire sous le seuil de poussière : la transaction serait
   * construite, signée, puis REFUSÉE à la diffusion, avec un message de nœud
   * incompréhensible. Autant le dire avant de signer.
   */
  if (target < dustThreshold(toKind)) return null;
  const rate = Math.max(1, feeRate); // au moins 1 sat/vB
  const sorted = [...utxos].filter((u) => u.value > 0).sort((a, b) => b.value - a.value);

  const chosen: Utxo[] = [];
  let sum = 0n;
  for (const u of sorted) {
    /*
     * Entrée non rentable : elle apporte moins qu'elle ne coûte à dépenser.
     * L'ajouter réduirait le montant disponible au lieu de l'augmenter. On
     * arrête là — les pièces suivantes sont plus petites encore (tri décroissant).
     */
    if (BigInt(u.value) <= BigInt(Math.ceil(INPUT_VBYTES * rate))) break;
    if (chosen.length >= MAX_INPUTS) return null;
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
