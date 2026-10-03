/** Répartition du portefeuille par actif ou par réseau (calcul pur, testé). */
import { chainBrandColor, tokenTint } from './tokenColors';
import { CHAIN_LOGO_SVG } from '../src/domain/chains/chainLogos.generated';
import { getAdapter } from '../src';

export type AllocationInput = { symbol: string; name: string; chainId: string; fiat: number; coingeckoId?: string };
export type Slice = { key: string; label: string; value: number; pct: number; color: string };

/** Regroupe, trie, garde les `top` plus grosses parts et rassemble le reste en « Autres ». */
export function allocationSlices(items: AllocationInput[], by: 'asset' | 'chain', otherLabel: string, top = 5): Slice[] {
  const groups = new Map<string, Slice>();
  let total = 0;
  for (const h of items) {
    if (!(h.fiat > 0)) continue;
    total += h.fiat;
    let chainName = h.chainId;
    try {
      chainName = getAdapter(h.chainId).config.name;
    } catch {
      /* réseau inconnu : son identifiant */
    }
    const key = by === 'asset' ? (h.coingeckoId ?? h.symbol.toUpperCase()) : h.chainId;
    const label = by === 'asset' ? h.symbol.toUpperCase() : chainName;
    const color = (by === 'asset' ? tokenTint(h.coingeckoId ?? h.symbol.toLowerCase(), null, CHAIN_LOGO_SVG) : chainBrandColor(h.chainId, CHAIN_LOGO_SVG)) ?? '#9499AB';
    const g = groups.get(key);
    if (g) g.value += h.fiat;
    else groups.set(key, { key, label, value: h.fiat, pct: 0, color });
  }
  if (total <= 0) return [];
  const sorted = [...groups.values()].sort((a, b) => b.value - a.value);
  const head = sorted.slice(0, top);
  const rest = sorted.slice(top).reduce((s, x) => s + x.value, 0);
  const out = rest > 0 ? [...head, { key: 'other', label: otherLabel, value: rest, pct: 0, color: '#5D6275' }] : head;
  return out.map((s) => ({ ...s, pct: (s.value / total) * 100 }));
}

