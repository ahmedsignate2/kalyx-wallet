/**
 * RECHERCHE DES COMPTES — à l'import d'une phrase, retrouver les comptes
 * (indices HD 1, 2, 3…) qui ont déjà servi, comme le font les portefeuilles
 * matériels : on avance tant qu'on trouve de l'activité, et on s'arrête après
 * `gap` comptes vides D'AFFILÉE.
 *
 * Trois réponses par compte, jamais deux : « utilisé », « vide », ou
 * « inconnu » (réseau muet). Un inconnu n'est NI ajouté NI compté comme vide —
 * le prendre pour vide arrêterait la recherche trop tôt et cacherait des
 * fonds ; il est rapporté pour que l'écran le dise (« certains comptes n'ont pas
 * pu être vérifiés »). Mais un réseau durablement muet ne doit pas faire sonder
 * les 20 comptes : après `2 × gap` comptes SANS activité (vides ou inconnus),
 * la recherche s'arrête aussi.
 *
 * Pur : la sonde (réseau) est injectée.
 */
export type AccountActivity = 'used' | 'empty' | 'unknown';

export interface DiscoveryResult {
  /** Indices avec de l'activité, à ajouter. */
  found: number[];
  /** Indices dont l'activité n'a pas pu être lue. */
  uncertain: number[];
  /** Dernier indice examiné. */
  lastChecked: number;
}

export async function discoverAccountIndexes(
  probe: (index: number) => Promise<AccountActivity>,
  opts: { start?: number; gap?: number; max?: number; known?: ReadonlySet<number>; onProgress?: (index: number) => void } = {},
): Promise<DiscoveryResult> {
  const { start = 1, gap = 3, max = 20, known = new Set<number>(), onProgress } = opts;
  const found: number[] = [];
  const uncertain: number[] = [];
  let emptyRun = 0;
  let quietRun = 0; // vides OU inconnus depuis la dernière activité
  let i = start;
  for (; i <= max && emptyRun < gap && quietRun < gap * 2; i++) {
    onProgress?.(i);
    // Compte déjà présent : il compte comme utilisé (on cherche AU-DELÀ), sans être rajouté.
    if (known.has(i)) {
      emptyRun = 0;
      quietRun = 0;
      continue;
    }
    let r: AccountActivity;
    try {
      r = await probe(i);
    } catch {
      r = 'unknown';
    }
    if (r === 'used') {
      found.push(i);
      emptyRun = 0;
      quietRun = 0;
    } else if (r === 'empty') {
      emptyRun += 1;
      quietRun += 1;
    } else {
      // Peut-être utilisé : l'écart de `gap` vides se recompte APRÈS lui (sinon on s'arrêterait trop tôt).
      uncertain.push(i);
      emptyRun = 0;
      quietRun += 1;
    }
  }
  return { found, uncertain, lastChecked: i - 1 };
}

/** Synthèse de plusieurs sondes (une par réseau) : utilisé si l'une l'est ; vide seulement si TOUTES ont répondu vide. */
export function combineActivity(results: AccountActivity[]): AccountActivity {
  if (results.includes('used')) return 'used';
  if (results.length && results.every((r) => r === 'empty')) return 'empty';
  return 'unknown';
}
