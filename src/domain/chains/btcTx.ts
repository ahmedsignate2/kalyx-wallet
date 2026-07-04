/**
 * Helpers PURS pour la construction d'une transaction Bitcoin (P2WPKH / SegWit
 * natif) : estimation de la taille virtuelle (vB) et sélection des UTXO.
 *
 * Séparés de l'adapter (réseau + signature) pour être testés sans réseau.
 * Modèle UTXO : on choisit des « pièces » (sorties non dépensées) couvrant le
 * montant + les frais, avec éventuellement une sortie de « monnaie » (change).
 */

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

/**
 * Taille virtuelle (vB) d'une tx P2WPKH : ~10,5 d'en-tête + 68/entrée + 31/sortie.
 * Arrondi au supérieur (les frais se calculent sur des vB entiers).
 */
export function estimateVsize(inputs: number, outputs: number): number {
  return Math.ceil(10.5 + inputs * 68 + outputs * 31);
}

/**
 * Sélectionne les UTXO couvrant `target` sats + frais (feeRate en sat/vB).
 * Stratégie simple « plus grosses pièces d'abord » (minimise le nombre
 * d'entrées). Renvoie null si le solde est insuffisant, frais compris.
 */
export function selectUtxos(utxos: Utxo[], target: bigint, feeRate: number): CoinSelection | null {
  if (target <= 0n) return null;
  const rate = Math.max(1, feeRate); // au moins 1 sat/vB
  const sorted = [...utxos].filter((u) => u.value > 0).sort((a, b) => b.value - a.value);

  const chosen: Utxo[] = [];
  let sum = 0n;
  for (const u of sorted) {
    chosen.push(u);
    sum += BigInt(u.value);

    const feeWithChange = BigInt(Math.ceil(estimateVsize(chosen.length, 2) * rate));
    if (sum >= target + feeWithChange) {
      const change = sum - target - feeWithChange;
      if (change >= DUST_SATS) {
        return { inputs: chosen, fee: feeWithChange, change };
      }
      // Monnaie sous le seuil : pas de sortie de change, on l'absorbe en frais.
      const feeNoChange = BigInt(Math.ceil(estimateVsize(chosen.length, 1) * rate));
      if (sum >= target + feeNoChange) {
        return { inputs: chosen, fee: sum - target, change: 0n };
      }
      // Sinon on continue d'accumuler des pièces.
    }
  }
  return null; // solde insuffisant
}
