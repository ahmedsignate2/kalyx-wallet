/** Fusion d'un chargement Earn partiel avec les dernières valeurs connues (pur, testable). */
import type { EarnPosition } from '../../src/domain/earn/types';

export interface EarnBalances {
  underlying: Record<string, bigint>;
  gas: Record<string, bigint>;
}

/**
 * Protocoles non lus : les DERNIÈRES valeurs connues (même compte) sont
 * gardées au lieu d'un zéro inventé ; jamais lus, ils restent absents.
 */
export function mergeFailed(
  prev: { balances: EarnBalances; positions: EarnPosition[] } | null,
  next: { balances: EarnBalances; positions: EarnPosition[]; failed: string[] },
): { balances: EarnBalances; positions: EarnPosition[] } {
  if (!next.failed.length || !prev) return { balances: next.balances, positions: next.positions };
  const keep = new Set(next.failed);
  const underlying = { ...next.balances.underlying };
  const gas = { ...next.balances.gas };
  for (const id of keep) {
    if (prev.balances.underlying[id] !== undefined) underlying[id] = prev.balances.underlying[id];
    if (prev.balances.gas[id] !== undefined) gas[id] = prev.balances.gas[id];
  }
  const positions = [...next.positions.filter((p) => !keep.has(p.protocolId)), ...prev.positions.filter((p) => keep.has(p.protocolId))];
  return { balances: { underlying, gas }, positions };
}

