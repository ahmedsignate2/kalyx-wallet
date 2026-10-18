/**
 * TRAITS d'un NFT (« Fond : bleu », « Yeux : laser »), tels que l'émetteur les
 * a inscrits dans ses métadonnées — la même liste chez Alchemy (EVM), Helius
 * (Solana) et TonAPI (TON), au format OpenSea `{ trait_type, value }`.
 *
 * Ce sont des données écrites par n'importe qui : bornées en nombre et en
 * longueur, nettoyées des caractères invisibles, jamais interprétées.
 */

export interface NftTrait {
  type: string;
  value: string;
}

/** Part des NFT de la collection qui portent ce trait (0 à 1), si le fournisseur la donne. */
export interface NftTraitRarity extends NftTrait {
  prevalence: number;
}

const MAX_TRAITS = 40;
const MAX_LEN = 64;
// eslint-disable-next-line no-control-regex -- les caractères de contrôle sont justement ce qu'on retire
const INVISIBLE = /[\u0000-\u001f\u007f\u200b-\u200f\u202a-\u202e\u2060-\u2064\ufeff]/g;

function clean(v: unknown): string {
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : '';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v !== 'string') return '';
  return v.replace(INVISIBLE, '').trim().slice(0, MAX_LEN);
}

export function parseTraits(raw: unknown): NftTrait[] {
  if (!Array.isArray(raw)) return [];
  const out: NftTrait[] = [];
  for (const a of raw) {
    if (!a || typeof a !== 'object') continue;
    const o = a as Record<string, unknown>;
    const type = clean(o.trait_type ?? o.traitType ?? o.key ?? o.name);
    const value = clean(o.value);
    if (!type || !value) continue;
    out.push({ type, value });
    if (out.length >= MAX_TRAITS) break;
  }
  return out;
}

const key = (t: NftTrait) => `${t.type.toLowerCase()}\u0000${t.value.toLowerCase()}`;

/** Réponse Alchemy `computeRarity` → rareté de chaque trait. */
export function parseRarity(json: unknown): NftTraitRarity[] {
  const list = (json as { rarities?: unknown[] } | null)?.rarities;
  if (!Array.isArray(list)) return [];
  const out: NftTraitRarity[] = [];
  for (const r of list) {
    const o = (r ?? {}) as Record<string, unknown>;
    const type = clean(o.traitType ?? o.trait_type);
    const value = clean(o.value);
    const prevalence = typeof o.prevalence === 'number' ? o.prevalence : NaN;
    if (!type || !value || !(prevalence > 0 && prevalence <= 1)) continue;
    out.push({ type, value, prevalence });
  }
  return out;
}

/** Associe à chaque trait sa rareté connue (ou rien). */
export function withRarity(traits: NftTrait[], rarities: NftTraitRarity[]): (NftTrait & { prevalence?: number })[] {
  const byKey = new Map(rarities.map((r) => [key(r), r.prevalence]));
  return traits.map((t) => {
    const p = byKey.get(key(t));
    return p === undefined ? t : { ...t, prevalence: p };
  });
}
