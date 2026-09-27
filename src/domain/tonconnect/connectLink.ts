/**
 * TON Connect — lecture d'un lien de connexion (QR ou lien profond).
 *
 * Formes relevées dans `@tonconnect/sdk` 4.0.2 (`generateUniversalLink`) :
 *  - lien universel d'un wallet : `https://app.tonkeeper.com/ton-connect?v=2&id=…&r=…`
 *  - lien générique : `tc://?v=2&id=…&r=…`
 *  - lien Telegram : `https://t.me/wallet/start?startapp=tonconnect-v__2-id__…`
 *    (paramètres réencodés par `encodeTelegramUrlParameters` : `&`→`-`,
 *    `=`→`__`, `%`→`--`, et `.`/`-`/`_` percent-encodés).
 *
 * LE PONT. La dApp écoute sur le pont du wallet dont elle a affiché le QR :
 * scanner le QR « Tonkeeper » veut dire que la réponse doit partir sur le pont
 * de Tonkeeper. On le retrouve par le lien lui-même, dans la liste officielle
 * des wallets (`wallets-bridges.json`) ; à défaut, le pont de TonAPI, le plus
 * répandu.
 */
import WALLETS from './wallets-bridges.json';

export const DEFAULT_BRIDGE = 'https://bridge.tonapi.io/bridge';

export interface ConnectRequest {
  manifestUrl: string;
  items: ({ name: 'ton_addr' } | { name: 'ton_proof'; payload: string } | { name: string })[];
}

export interface ParsedConnectLink {
  /** Identifiant client de la dApp (clé publique x25519, hex). */
  clientId: string;
  request: ConnectRequest;
  /** Pont sur lequel répondre. */
  bridge: string;
  /** `back`, `none` ou une URL : où renvoyer l'utilisateur après la réponse. */
  ret?: string;
}

/** Inverse exact de `encodeTelegramUrlParameters` (SDK). */
export function decodeTelegramParams(s: string): string {
  const all = (x: string, from: string, to: string) => x.split(from).join(to);
  return all(all(all(all(all(all(s, '--', '%'), '__', '='), '-', '&'), '%5F', '_'), '%2D', '-'), '%2E', '.');
}

/** Clé de comparaison d'un lien : hôte + chemin, et pour Telegram le seul nom du bot. */
function linkKey(url: URL): string {
  if (url.host === 't.me') return `t.me/${url.pathname.split('/')[1] ?? ''}`.toLowerCase();
  return `${url.host}${url.pathname.replace(/\/+$/, '')}`.toLowerCase();
}

const BRIDGE_BY_LINK = new Map<string, string>(
  WALLETS.wallets.flatMap((w) => {
    try {
      return [[linkKey(new URL(w.universal)), w.bridge] as const];
    } catch {
      return [];
    }
  }),
);

/** Pont à utiliser pour un lien scanné. */
export function bridgeForLink(link: string): string {
  try {
    const u = new URL(link);
    if (u.protocol === 'tc:') return DEFAULT_BRIDGE;
    return BRIDGE_BY_LINK.get(linkKey(u)) ?? DEFAULT_BRIDGE;
  } catch {
    return DEFAULT_BRIDGE;
  }
}

/**
 * Paramètres d'une chaîne de requête. Pas `URLSearchParams` : celui de React
 * Native coupe une valeur au premier « = » qu'elle contient et lève sur un « % »
 * mal formé — on ne veut pas qu'un QR décide du comportement selon la plateforme.
 */
function parseQuery(query: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const pair of query.replace(/^\?/, '').split('&')) {
    if (!pair) continue;
    const eq = pair.indexOf('=');
    const decode = (s: string) => {
      try {
        return decodeURIComponent(s.replace(/\+/g, ' '));
      } catch {
        return s;
      }
    };
    const key = decode(eq < 0 ? pair : pair.slice(0, eq));
    if (!out.has(key)) out.set(key, eq < 0 ? '' : decode(pair.slice(eq + 1)));
  }
  return out;
}

/** Paramètres de requête d'un lien, Telegram compris. */
function paramsOf(link: string): Map<string, string> | null {
  const q = link.indexOf('?');
  if (q < 0) return null;
  const params = parseQuery(link.slice(q + 1).split('#')[0]);
  const startapp = params.get('startapp');
  if (startapp?.startsWith('tonconnect-')) return parseQuery(decodeTelegramParams(startapp.slice('tonconnect-'.length)));
  return params;
}

/** Vrai si le texte ressemble à une demande TON Connect (sans la valider). */
export function looksLikeTonConnect(text: string): boolean {
  const p = paramsOf(text.trim());
  return !!p && p.get('v') === '2' && !!p.get('id') && !!p.get('r');
}

/**
 * Lit un lien de connexion. Null si ce n'en est pas un, ou s'il est invalide :
 * version autre que 2, identifiant client qui n'est pas une clé x25519, requête
 * illisible ou sans manifeste https, aucune demande d'adresse.
 */
export function parseConnectLink(text: string): ParsedConnectLink | null {
  const link = text.trim();
  const p = paramsOf(link);
  if (!p || p.get('v') !== '2') return null;
  const clientId = (p.get('id') ?? '').toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(clientId)) return null;
  let request: ConnectRequest;
  try {
    request = JSON.parse(p.get('r') ?? '') as ConnectRequest;
  } catch {
    return null;
  }
  if (typeof request?.manifestUrl !== 'string' || !/^https:\/\/[^\s]+$/.test(request.manifestUrl)) return null;
  if (!Array.isArray(request.items) || !request.items.some((i) => i?.name === 'ton_addr')) return null;
  const ret = p.get('ret') ?? undefined;
  return { clientId, request, bridge: bridgeForLink(link), ret };
}

export interface DappManifest {
  url: string;
  name: string;
  iconUrl: string;
  termsOfUseUrl?: string;
  privacyPolicyUrl?: string;
}

/**
 * Manifeste lu et contrôlé. `url` doit être https ; c'est son DOMAINE qui est
 * signé dans `ton_proof` (spec) et affiché à l'utilisateur.
 */
export function parseManifest(json: unknown): DappManifest | null {
  const m = json as Partial<DappManifest> | null;
  if (!m || typeof m.url !== 'string' || typeof m.name !== 'string') return null;
  let host: string;
  try {
    const u = new URL(m.url);
    if (u.protocol !== 'https:') return null;
    host = u.host;
  } catch {
    return null;
  }
  // Spec (« Domain-binding rules ») : un domaine de dApp contient au moins un point.
  if (!/^[^.]+\.[^.]/.test(host)) return null;
  const icon = typeof m.iconUrl === 'string' && /^https:\/\//.test(m.iconUrl) ? m.iconUrl : '';
  return { url: m.url, name: m.name.slice(0, 80), iconUrl: icon, termsOfUseUrl: m.termsOfUseUrl, privacyPolicyUrl: m.privacyPolicyUrl };
}

/** Domaine affiché et signé (`ton_proof`) : l'hôte de `manifest.url`. */
export function manifestDomain(manifest: DappManifest): string {
  return new URL(manifest.url).host;
}

/**
 * Le manifeste doit être hébergé sur le domaine qu'il déclare (règle de
 * Tonkeeper, `connectService.ts`) : sinon n'importe quel site pourrait publier
 * un manifeste « url: https://app.ston.fi » et se faire signer une preuve au
 * nom de STON.fi.
 */
export function manifestOriginMatches(manifestUrl: string, manifest: DappManifest): boolean {
  const origin = (u: string) => {
    const m = /^https:\/\/([^/?#]+)/i.exec(u);
    return m ? m[1].toLowerCase() : null;
  };
  const a = origin(manifestUrl);
  return !!a && a === origin(manifest.url);
}
