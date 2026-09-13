/**
 * APY des protocoles Earn — parseurs purs + fetch best-effort.
 *
 * - Staking liquide : DefiLlama `poolsEnriched?pool=<id>` (réponse < 2 Ko par
 *   pool, contrairement à `/pools` = 11 Mo).
 * - Aave v3 : lu ON-CHAIN via `getReserveData` (voir abi.ts) par l'app ; le
 *   pool DefiLlama sert de repli.
 */
import { withTimeout } from '../chains/net';

const LLAMA = 'https://yields.llama.fi';
const TIMEOUT = 12_000;

/** Parse la réponse `poolsEnriched` : APY en % ou null. */
export function parseLlamaPoolApy(json: unknown): number | null {
  const d = (json as { data?: { apy?: unknown; apyBase?: unknown }[] })?.data?.[0];
  if (!d) return null;
  const v = typeof d.apy === 'number' ? d.apy : typeof d.apyBase === 'number' ? d.apyBase : null;
  return v !== null && Number.isFinite(v) && v >= 0 ? v : null;
}

/** APY d'un pool DefiLlama (null si indisponible — jamais de valeur inventée). */
export async function fetchLlamaPoolApy(pool: string): Promise<number | null> {
  try {
    const res = await withTimeout(
      fetch(`${LLAMA}/poolsEnriched?pool=${encodeURIComponent(pool)}`, { headers: { Accept: 'application/json' } }),
      TIMEOUT,
      () => new Error('timeout'),
    );
    if (!res.ok) return null;
    return parseLlamaPoolApy(await res.json());
  } catch {
    return null;
  }
}

/** Rendement annuel estimé (unités du sous-jacent) pour `amount` à `apyPct`. */
export function yearlyYield(amount: number, apyPct: number): number {
  if (!Number.isFinite(amount) || !Number.isFinite(apyPct) || amount <= 0 || apyPct <= 0) return 0;
  return amount * (apyPct / 100);
}
