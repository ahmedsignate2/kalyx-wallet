/**
 * PRÉSENCE DE KALYX SUR LES SITES : partout (par défaut, comme les autres
 * portefeuilles : les dApps le découvrent seules), ou « sites autorisés
 * seulement » (réglage) : ailleurs, ni script de page ni relais, la page ne
 * sait même pas que Kalyx est installé.
 *
 * En mode restreint, un site est autorisé par un geste explicite (bouton du
 * popup sur l'onglet ouvert) ; un site déjà connecté le reste.
 *
 * Les motifs Chrome n'ont pas de port : « http://localhost:5173 » autorise
 * localhost, tous ports.
 */
import { webOrigin } from './sites';
import type { Store } from './storage';

export type SiteMode = 'all' | 'allowed';
export const ALL_SITES = ['http://*/*', 'https://*/*'];
const MAX_ALLOWED = 300;

/** Motif Chrome d'une origine web (null si ce n'est pas une page http(s)). */
export function matchFor(origin: string): string | null {
  const o = webOrigin(origin);
  if (!o) return null;
  const u = new URL(o);
  return `${u.protocol}//${u.hostname}/*`;
}

export interface SiteAccessDeps {
  disk: Store;
  /** Origines connectées (lib/sites) : autorisées d'office en mode restreint. */
  connected: () => Promise<string[]>;
  /** (Ré)enregistre les scripts de page sur ces motifs ([] : nulle part). */
  register: (matches: string[]) => Promise<void>;
}

export function makeSiteAccess(deps: SiteAccessDeps) {
  const mode = async (): Promise<SiteMode> => ((await deps.disk.get<string>('siteMode')) === 'allowed' ? 'allowed' : 'all');
  const allowed = async (): Promise<string[]> => (await deps.disk.get<string[]>('allowedSites')) ?? [];

  async function matches(): Promise<string[]> {
    if ((await mode()) === 'all') return ALL_SITES;
    const origins = new Set([...(await allowed()), ...(await deps.connected().catch(() => []))]);
    return [...new Set([...origins].map(matchFor).filter((m): m is string => !!m))].sort();
  }

  const apply = async () => deps.register(await matches());

  return {
    mode,
    allowed,
    matches,
    apply,
    async setMode(m: unknown): Promise<void> {
      if (m !== 'all' && m !== 'allowed') throw new Error('BAD_REQUEST');
      await deps.disk.set('siteMode', m);
      await apply();
    },
    /** Kalyx actif sur cette origine ? (mode « partout » : toujours, pour une page web) */
    async active(origin: string): Promise<boolean> {
      const m = matchFor(origin);
      return !!m && (await matches()).some((x) => x === m || ALL_SITES.includes(x));
    },
    async allow(origin: unknown): Promise<string> {
      const o = typeof origin === 'string' ? webOrigin(origin) : null;
      if (!o) throw new Error('BAD_ORIGIN');
      const list = await allowed();
      if (!list.includes(o)) {
        if (list.length >= MAX_ALLOWED) throw new Error('TOO_MANY_SITES');
        await deps.disk.set('allowedSites', [...list, o].sort());
      }
      await apply();
      return o;
    },
    async forbid(origin: unknown): Promise<void> {
      const list = await allowed();
      await deps.disk.set('allowedSites', list.filter((x) => x !== origin));
      await apply();
    },
  };
}

export type SiteAccess = ReturnType<typeof makeSiteAccess>;
