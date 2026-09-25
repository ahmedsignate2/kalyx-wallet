/**
 * Frais de priorité Solana (ComputeBudget) — purs et testables.
 *
 * TROU CORRIGÉ. Aucune transaction Solana émise par Kalyx ne portait
 * d'instruction ComputeBudget. Sans elle, la transaction part avec une priorité
 * nulle : dès que le réseau est chargé, les validateurs servent d'abord celles
 * qui paient, et la nôtre est simplement ABANDONNÉE au bout de la validité du
 * blockhash. L'utilisateur ne voyait rien — on lui rendait une signature, et
 * personne ne vérifiait ensuite qu'elle avait atterri.
 *
 * Deux instructions, toujours les deux ensemble :
 * - `SetComputeUnitLimit` : le budget demandé ;
 * - `SetComputeUnitPrice` : le prix en micro-lamports par unité de calcul.
 *
 * Les frais de priorité valent `prix × LIMITE DEMANDÉE`, pas × unités
 * consommées. Une limite trop large se paie donc en vrai, ce qui interdit de
 * mettre 200 000 « au cas où » : les constantes ci-dessous sont ajustées au
 * plus près de ce que coûtent réellement nos deux transactions.
 */
import type { Instruction } from './solMessage';

export const COMPUTE_BUDGET_PROGRAM = 'ComputeBudget111111111111111111111111111111';

/** Discriminants du programme ComputeBudget. */
const IX_SET_UNIT_LIMIT = 2;
const IX_SET_UNIT_PRICE = 3;

/**
 * Budget d'un transfert SOL : ~450 unités pour l'instruction System `transfer`,
 * plus 150 par instruction ComputeBudget (elles se facturent aussi). 1 000
 * laisse la marge sans gonfler les frais.
 */
export const CU_SOL_TRANSFER = 1_000;

/**
 * Budget d'un transfert SPL. La création idempotente de l'ATA domine (~22 000
 * quand elle crée vraiment, quasi rien sinon), `TransferChecked` ~6 200, et les
 * mints Token-2022 coûtent davantage. 50 000 couvre le pire cas ; le surcoût de
 * priorité reste inférieur à 0,0003 SOL même au plafond de prix.
 */
export const CU_SPL_TRANSFER = 50_000;

/**
 * Plancher de prix, en micro-lamports par unité de calcul.
 *
 * Pas zéro : une transaction à priorité nulle est la première jetée en cas de
 * charge. À ce plancher, un transfert SOL paie 10 lamports de priorité —
 * indolore, et suffisant pour ne pas être en dernière file.
 */
export const PRIORITY_FEE_FLOOR = 10_000n;

/**
 * Plafond de prix. Protège contre un réseau en pleine folie ou un RPC qui
 * renvoie une valeur aberrante : sans plafond, une réponse malformée pourrait
 * faire payer un transfert bien plus cher que ce qu'il transporte.
 */
export const PRIORITY_FEE_CAP = 5_000_000n;

/** Centile retenu par défaut parmi les échantillons récents. */
const PERCENTILE = 0.75;

/**
 * Centiles des trois paliers proposés à l'utilisateur.
 *
 * Des centiles et non des multiplicateurs arbitraires : « rapide » doit vouloir
 * dire « au-dessus de 95 % de ce que le réseau a vu récemment », ce qui reste
 * vrai quand le réseau change d'échelle. Doubler un prix ne veut rien dire.
 */
export const SPEED_PERCENTILES = { slow: 0.5, normal: 0.75, fast: 0.95 } as const;

/** Instruction : fixer la limite d'unités de calcul. */
export function setComputeUnitLimitIx(units: number): Instruction {
  const u = Math.max(1, Math.min(1_400_000, Math.floor(units)));
  return {
    programId: COMPUTE_BUDGET_PROGRAM,
    keys: [],
    data: Uint8Array.of(IX_SET_UNIT_LIMIT, u & 0xff, (u >>> 8) & 0xff, (u >>> 16) & 0xff, (u >>> 24) & 0xff),
  };
}

/** Instruction : fixer le prix par unité de calcul (micro-lamports). */
export function setComputeUnitPriceIx(microLamports: bigint): Instruction {
  const bytes: number[] = [IX_SET_UNIT_PRICE];
  let v = microLamports < 0n ? 0n : microLamports;
  for (let i = 0; i < 8; i++) {
    bytes.push(Number(v & 0xffn));
    v >>= 8n;
  }
  return { programId: COMPUTE_BUDGET_PROGRAM, keys: [], data: Uint8Array.from(bytes) };
}

/** Les deux instructions de priorité, dans l'ordre attendu, en tête de tx. */
export function priorityInstructions(units: number, microLamports: bigint): Instruction[] {
  return [setComputeUnitLimitIx(units), setComputeUnitPriceIx(microLamports)];
}

/**
 * Prix à retenir d'après les échantillons de `getRecentPrioritizationFees`.
 *
 * Centile 75 et non moyenne : la moyenne est écrasée par la masse de blocs à
 * zéro et sous-estime exactement le moment où ça compte, celui où le réseau est
 * chargé. Toujours ramené entre le plancher et le plafond, y compris quand le
 * RPC répond n'importe quoi — une valeur absurde ne doit pas devenir un prix.
 */
export function pickPriorityFee(samples: unknown, percentile: number = PERCENTILE): bigint {
  const fees = Array.isArray(samples)
    ? samples
        .map((s) => (s && typeof s === 'object' ? (s as { prioritizationFee?: unknown }).prioritizationFee : undefined))
        .map((f) => (typeof f === 'number' && Number.isFinite(f) && f >= 0 ? Math.floor(f) : null))
        .filter((f): f is number => f !== null)
    : [];

  if (fees.length === 0) return PRIORITY_FEE_FLOOR;

  fees.sort((a, b) => a - b);
  const p = Math.min(1, Math.max(0, percentile));
  const idx = Math.min(fees.length - 1, Math.floor(fees.length * p));
  const picked = BigInt(fees[idx]);

  if (picked < PRIORITY_FEE_FLOOR) return PRIORITY_FEE_FLOOR;
  if (picked > PRIORITY_FEE_CAP) return PRIORITY_FEE_CAP;
  return picked;
}
