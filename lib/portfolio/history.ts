/**
 * Courbe de valeur du portefeuille (§4.1) : Σ montant_i × prix_i(t) pour les
 * actifs qui ont un historique CoinGecko (top 4 par valeur), + le reste en
 * constante (stables, tokens sans historique). Montants supposés constants sur
 * la période. Cache mémoire par (clé, période) 5 min — CoinGecko est rate-limité.
 */
import { getMarketChartPoints, type ChartPoint } from '../../src';
import type { Holding } from './portfolioStore';

export type Period = '1J' | '1S' | '1M' | '1A' | 'Tout';
export const PERIODS: Period[] = ['1J', '1S', '1M', '1A', 'Tout'];
const DAYS: Record<Period, string> = { '1J': '1', '1S': '7', '1M': '30', '1A': '365', Tout: 'max' };

const cache = new Map<string, { at: number; points: ChartPoint[] }>();
const TTL = 5 * 60_000;

/** Pur : combine des séries de prix (timestamps du 1er actif) pondérées par les montants. */
export function combineSeries(series: { amount: number; points: ChartPoint[] }[], constant: number): ChartPoint[] {
  const base = series.find((s) => s.points.length > 1)?.points ?? [];
  if (base.length === 0) return [];
  const idx = series.map(() => 0);
  return base.map((bp) => {
    let v = constant;
    series.forEach((s, k) => {
      const pts = s.points;
      if (pts.length === 0) return;
      // Avance jusqu'au point le plus proche ≤ t (séries triées par temps).
      while (idx[k] + 1 < pts.length && pts[idx[k] + 1].t <= bp.t) idx[k]++;
      v += s.amount * pts[idx[k]].v;
    });
    return { t: bp.t, v };
  });
}

/**
 * Pur : ≤ 80 points (sous-échantillonnage) + moyenne mobile sur 3 — une courbe
 * « nerveuse » (CoinGecko renvoie ~170 points sur 7 j) devient lisible.
 */
export function smooth(points: ChartPoint[], max = 80): ChartPoint[] {
  if (points.length <= 2) return points;
  const step = Math.max(1, Math.ceil(points.length / max));
  const sampled = points.filter((_, i) => i % step === 0 || i === points.length - 1);
  return sampled.map((p, i, arr) => {
    const a = arr[Math.max(0, i - 1)].v;
    const b = arr[Math.min(arr.length - 1, i + 1)].v;
    return { t: p.t, v: (a + p.v + b) / 3 };
  });
}

export async function portfolioHistory(holdings: Holding[], fiat: string, period: Period, key: string): Promise<ChartPoint[]> {
  const ck = `${key}:${period}`;
  const hit = cache.get(ck);
  if (hit && Date.now() - hit.at < TTL) return hit.points;

  const withId = holdings.filter((h) => h.coingeckoId && h.fiat > 0).slice(0, 4);
  const constant = holdings.filter((h) => !withId.includes(h)).reduce((s, h) => s + h.fiat, 0);
  if (withId.length === 0) return [];
  const series = await Promise.all(
    withId.map(async (h) => ({ amount: h.amount, points: await getMarketChartPoints(h.coingeckoId!, fiat, DAYS[period]).catch(() => [] as ChartPoint[]) })),
  );
  const points = smooth(combineSeries(series, constant));
  cache.set(ck, { at: Date.now(), points });
  return points;
}
