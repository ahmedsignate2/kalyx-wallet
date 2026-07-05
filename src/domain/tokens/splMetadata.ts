/**
 * Résolution des métadonnées de tokens SPL arbitraires (nom / symbole / logo).
 *
 * `getTokenAccountsByOwner` ne renvoie que mint + solde + décimales : ni nom ni
 * logo. La table curée `KNOWN_MINTS` couvre les gros mints hors-ligne ; ce
 * module enrichit les mints INCONNUS réellement détenus par l'utilisateur via
 * l'API de recherche Jupiter (v2), en un seul appel batché (mints séparés par
 * des virgules). Best-effort : en cas d'échec réseau on garde le mint tronqué —
 * la fonction ne lève jamais.
 */
import { withTimeout } from '../chains/net';
import { KNOWN_MINTS } from './splTokens';

export interface SplMeta {
  symbol: string;
  name: string;
  logo?: string;
}

const JUP_SEARCH = 'https://lite-api.jup.ag/tokens/v2/search';
const TIMEOUT_MS = 10_000;

/** URL de recherche batch Jupiter (mints séparés par des virgules). */
export function buildSearchUrl(mints: string[]): string {
  return `${JUP_SEARCH}?query=${mints.join(',')}`;
}

interface JupToken {
  id?: string; // = adresse du mint
  symbol?: string;
  name?: string;
  icon?: string;
}

/** Parse la réponse Jupiter v2 (tableau) → table mint → métadonnées. */
export function parseSearchResponse(json: unknown): Record<string, SplMeta> {
  const out: Record<string, SplMeta> = {};
  if (!Array.isArray(json)) return out;
  for (const t of json as JupToken[]) {
    if (!t?.id || !t.symbol) continue;
    out[t.id] = { symbol: t.symbol, name: t.name ?? t.symbol, logo: t.icon };
  }
  return out;
}

type FetchLike = (url: string) => Promise<{ json: () => Promise<unknown> }>;

/**
 * Résout les métadonnées des `mints` donnés, en ignorant ceux déjà présents
 * dans `KNOWN_MINTS` (repli offline instantané). Réseau injectable (testable).
 * Renvoie une table éventuellement vide ; n'échoue jamais.
 */
export async function fetchSplMetadata(
  mints: string[],
  fetchImpl: FetchLike = fetch as unknown as FetchLike,
): Promise<Record<string, SplMeta>> {
  const unknown = [...new Set(mints)].filter((m) => !KNOWN_MINTS[m]);
  if (unknown.length === 0) return {};
  try {
    const res = await withTimeout(fetchImpl(buildSearchUrl(unknown)), TIMEOUT_MS, () => new Error('timeout'));
    return parseSearchResponse(await res.json());
  } catch {
    return {}; // dégradation gracieuse : les mints inconnus restent tronqués
  }
}
