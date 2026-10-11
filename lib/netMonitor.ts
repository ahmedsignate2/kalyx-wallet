/**
 * MONITEUR RÉSEAU (Développeur → Réseau) — un seul patch de `globalThis.fetch`,
 * installé dans index.js juste après le journal.
 *
 * Ce qui est gardé, et RIEN d'autre : hôte, méthode JSON-RPC (lue dans le
 * corps puis oubliée), statut HTTP, durée, taille annoncée (Content-Length).
 * Jamais le corps, les en-têtes, le chemin ni la requête : une URL RPC porte
 * souvent une clé d'API (`/v2/<clé>`, `?apikey=`), un corps peut porter une
 * transaction signée.
 *
 * NE CASSE JAMAIS UNE REQUÊTE. Toute la comptabilité est dans des `try` ; la
 * promesse rendue est celle de `fetch` d'origine (même Response, même erreur,
 * relancée telle quelle). La Response n'est ni lue ni clonée : la taille vient
 * de l'en-tête, jamais du corps.
 *
 * Session leurre : rien n'est enregistré, et le tampon est vidé à l'entrée.
 * Performance : aucun abonné = aucune notification ; avec un abonné (écran
 * ouvert), notifications regroupées toutes les 500 ms.
 */
import { isDecoySession, onDecoyChange } from './sessionMode';

export interface NetEntry {
  t: number;
  host: string;
  /** Méthode JSON-RPC (ex. `eth_call`), `batch×N` pour un lot, absente sinon. */
  rpc?: string;
  /** Verbe HTTP. */
  verb: string;
  /** 0 = pas de réponse (erreur réseau, abandon). */
  status: number;
  ms: number;
  /** Octets annoncés par le serveur (Content-Length), si connus. */
  size?: number;
  /** Nom de l'erreur (jamais son message, qui peut contenir l'URL). */
  err?: string;
}

export const NET_BUFFER = 200;
/** Au-delà, le corps n'est même pas parcouru pour y chercher la méthode. */
const MAX_SCAN = 16_384;

let buf: NetEntry[] = [];
const listeners = new Set<() => void>();
let notifyTimer: ReturnType<typeof setTimeout> | null = null;
let installedOn: object | null = null;

function notify(): void {
  if (listeners.size === 0 || notifyTimer) return;
  notifyTimer = setTimeout(() => {
    notifyTimer = null;
    for (const l of listeners) {
      try {
        l();
      } catch {
        /* abonné cassé : ignoré */
      }
    }
  }, 500);
}

/** Hôte seul (sans identifiants, chemin ni requête) ; un sous-domaine opaque (jeton) est masqué. */
export function hostOf(url: string): string {
  const m = /^[a-z][a-z0-9+.-]*:\/\/([^/?#]*)/i.exec(url);
  if (!m) return '(relatif)';
  const authority = m[1].replace(/^[^@]*@/, '').toLowerCase();
  return authority
    .split('.')
    .map((label) => (/^[a-z0-9_-]{20,}$/i.test(label) && /\d/.test(label) ? '[…]' : label))
    .join('.');
}

/** Méthode JSON-RPC lue dans le corps texte (jamais conservé). */
export function rpcMethodOf(body: unknown): string | undefined {
  if (typeof body !== 'string' || body.length === 0 || body.length > MAX_SCAN) return undefined;
  const first = body.trimStart()[0];
  if (first !== '{' && first !== '[') return undefined;
  const re = /"method"\s*:\s*"([A-Za-z0-9_.:-]{1,64})"/g;
  const found: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) && found.length < 100) found.push(m[1]);
  if (found.length === 0) return undefined;
  if (first === '[') return `batch×${found.length} ${found[0]}`;
  return found[0];
}

function urlOf(input: unknown): string {
  if (typeof input === 'string') return input;
  if (input && typeof input === 'object') {
    const o = input as { url?: unknown; href?: unknown };
    if (typeof o.url === 'string') return o.url; // Request
    if (typeof o.href === 'string') return o.href; // URL
  }
  return '';
}

function verbOf(input: unknown, init: unknown): string {
  const fromInit = init && typeof init === 'object' ? (init as { method?: unknown }).method : undefined;
  const fromReq = input && typeof input === 'object' ? (input as { method?: unknown }).method : undefined;
  const v = typeof fromInit === 'string' ? fromInit : typeof fromReq === 'string' ? fromReq : 'GET';
  return v.toUpperCase().slice(0, 8);
}

function sizeOf(res: unknown): number | undefined {
  try {
    const h = (res as { headers?: { get?: (k: string) => string | null } }).headers;
    const v = h?.get?.('content-length');
    const n = v ? Number(v) : NaN;
    return Number.isFinite(n) && n >= 0 ? n : undefined;
  } catch {
    return undefined;
  }
}

function push(e: NetEntry): void {
  buf.push(e);
  if (buf.length > NET_BUFFER) buf = buf.slice(-NET_BUFFER);
  notify();
}

/**
 * Installe le patch (une seule fois par objet global). `g` : injectable pour les tests.
 */
export function installNetMonitor(g: { fetch?: unknown } = globalThis as never): void {
  if (installedOn === g) return;
  const original = g.fetch as ((...a: unknown[]) => Promise<unknown>) | undefined;
  if (typeof original !== 'function' || (original as { __kalyxNet?: boolean }).__kalyxNet) return;
  installedOn = g;
  const now = () => (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now());

  const patched = function (...args: unknown[]): Promise<unknown> {
    if (isDecoySession()) return original.apply(g, args);
    let meta: { host: string; rpc?: string; verb: string } | null = null;
    const started = now();
    try {
      const [input, init] = args;
      const body = init && typeof init === 'object' ? (init as { body?: unknown }).body : undefined;
      meta = { host: hostOf(urlOf(input)), rpc: rpcMethodOf(body), verb: verbOf(input, init) };
    } catch {
      meta = null;
    }
    const finish = (status: number, size?: number, err?: string) => {
      try {
        if (!meta || isDecoySession()) return;
        push({ t: Date.now(), host: meta.host, ...(meta.rpc ? { rpc: meta.rpc } : {}), verb: meta.verb, status, ms: Math.round(now() - started), ...(size !== undefined ? { size } : {}), ...(err ? { err } : {}) });
      } catch {
        /* la comptabilité ne casse jamais une requête */
      }
    };
    let p: Promise<unknown>;
    try {
      p = original.apply(g, args);
    } catch (e) {
      finish(0, undefined, errName(e));
      throw e; // même erreur, relancée telle quelle
    }
    if (!p || typeof (p as Promise<unknown>).then !== 'function') return p;
    return p.then(
      (res) => {
        finish(typeof (res as { status?: unknown })?.status === 'number' ? (res as { status: number }).status : 0, sizeOf(res));
        return res; // la MÊME Response, non lue, non clonée
      },
      (e) => {
        finish(0, undefined, errName(e));
        throw e;
      },
    );
  };
  (patched as unknown as { __kalyxNet: boolean }).__kalyxNet = true;
  g.fetch = patched;
}

function errName(e: unknown): string {
  try {
    const n = (e as { name?: unknown })?.name;
    return typeof n === 'string' && /^[A-Za-z]{1,40}$/.test(n) ? n : 'Error';
  } catch {
    return 'Error';
  }
}

export function netEntries(): readonly NetEntry[] {
  return buf;
}

export function clearNetEntries(): void {
  buf = [];
  notify();
}

/** Abonnement : à n'utiliser que tant que l'écran est ouvert (retourne le désabonnement). */
export function subscribeNet(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export interface HostStat {
  host: string;
  count: number;
  p50: number;
  failRate: number;
}

/** Médiane des durées et taux d'échec (pas de réponse, ou statut ≥ 400) par hôte, du plus sollicité au moins. */
export function hostStats(entries: readonly NetEntry[] = buf): HostStat[] {
  const by = new Map<string, NetEntry[]>();
  for (const e of entries) {
    const a = by.get(e.host);
    if (a) a.push(e);
    else by.set(e.host, [e]);
  }
  return [...by.entries()]
    .map(([host, list]) => {
      const ms = list.map((e) => e.ms).sort((a, b) => a - b);
      const mid = Math.floor(ms.length / 2);
      const p50 = ms.length % 2 ? ms[mid] : Math.round((ms[mid - 1] + ms[mid]) / 2);
      const fails = list.filter((e) => e.status === 0 || e.status >= 400).length;
      return { host, count: list.length, p50, failRate: fails / list.length };
    })
    .sort((a, b) => b.count - a.count);
}

onDecoyChange((on) => {
  if (on) buf = [];
});
