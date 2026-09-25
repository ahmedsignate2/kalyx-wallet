/**
 * Paliers de frais Bitcoin (sat/vB) — purs et testables.
 *
 * TROU CORRIGÉ. L'adapter lisait une seule valeur, `halfHourFee`, et retombait
 * sur `8` en dur si l'API ne répondait pas. L'utilisateur n'avait donc AUCUN
 * choix de vitesse sur Bitcoin — alors que l'EVM en propose trois — et un repli
 * codé en dur est soit très au-dessus du marché (on surpaie), soit très en
 * dessous (la transaction reste des heures en attente), selon le jour.
 *
 * Trois paliers, dérivés des estimations du réseau :
 * - `slow`   → inclusion visée dans l'heure ;
 * - `normal` → dans la demi-heure ;
 * - `fast`   → prochain bloc.
 */
import type { FeeSpeed } from './gas';

export type BtcFeeRates = Record<FeeSpeed, number>;

/**
 * Repli quand le réseau ne répond pas.
 *
 * Volontairement BAS et non « moyen » : à taux trop faible la transaction
 * attend, ce qui est réparable — elle est marquée remplaçable (RBF), donc on
 * peut l'accélérer. À taux trop élevé, les frais sont payés et perdus. En cas
 * d'ignorance, on préfère l'erreur rattrapable.
 */
export const FALLBACK_RATES: BtcFeeRates = { slow: 2, normal: 4, fast: 8 };

/** Plancher protocolaire : en dessous, les nœuds ne relaient pas. */
export const MIN_RELAY_RATE = 1;

/**
 * Plafond de garde-fou.
 *
 * Une réponse d'API aberrante ne doit pas pouvoir vider un portefeuille en
 * frais : à 2 000 sat/vB, une transaction ordinaire coûterait déjà plus de
 * 0,003 BTC. Au-delà, on considère la valeur fausse plutôt que le réseau fou.
 */
export const MAX_SANE_RATE = 2_000;

interface RecommendedFees {
  fastestFee?: unknown;
  halfHourFee?: unknown;
  hourFee?: unknown;
  economyFee?: unknown;
  minimumFee?: unknown;
}

/** Nombre utilisable et plausible, sinon null. */
function rate(v: unknown): number | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.min(MAX_SANE_RATE, Math.max(MIN_RELAY_RATE, Math.ceil(n)));
}

/**
 * Traduit la réponse `/v1/fees/recommended` de mempool.space en trois paliers.
 *
 * Tolérant par construction : chaque champ manquant est remplacé par le palier
 * de repli correspondant, et les paliers sont réordonnés pour rester croissants.
 * Une API qui renverrait `fast` sous `slow` produirait sinon une interface où
 * « rapide » coûte moins cher que « lent », que personne ne peut comprendre.
 */
export function parseBtcFeeRates(json: unknown): BtcFeeRates {
  const f = (json ?? {}) as RecommendedFees;
  const minimum = rate(f.minimumFee) ?? MIN_RELAY_RATE;

  const slow = rate(f.hourFee) ?? rate(f.economyFee) ?? FALLBACK_RATES.slow;
  const normal = rate(f.halfHourFee) ?? FALLBACK_RATES.normal;
  const fast = rate(f.fastestFee) ?? FALLBACK_RATES.fast;

  // Monotonie : slow ≤ normal ≤ fast, et jamais sous le minimum de relais.
  const a = Math.max(minimum, slow);
  const b = Math.max(a, normal);
  const c = Math.max(b, fast);
  return { slow: a, normal: b, fast: c };
}

/**
 * Taux pour REMPLACER une transaction (BIP-125), ou `null` si c'est impossible.
 *
 * Un remplacement doit payer strictement plus que l'original, en absolu comme au
 * taux : les nœuds rejettent sinon le remplacement, et l'accélération échoue
 * sans que l'utilisateur comprenne pourquoi. On impose au moins +25 % et au
 * moins +1 sat/vB, ce qui couvre aussi le relais supplémentaire.
 *
 * `null` quand le plancher requis dépasse le plafond de garde-fou : mieux vaut
 * dire « impossible d'accélérer » que diffuser un remplacement dont on sait
 * qu'il sera refusé — l'utilisateur attendrait alors une accélération qui
 * n'arrive jamais.
 */
export function bumpedRate(previousRate: number, target: number): number | null {
  const floor = Math.max(Math.ceil(previousRate * 1.25), previousRate + 1);
  if (floor > MAX_SANE_RATE) return null;
  return Math.min(MAX_SANE_RATE, Math.max(floor, Math.ceil(target)));
}
