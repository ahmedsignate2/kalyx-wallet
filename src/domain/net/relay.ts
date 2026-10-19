/**
 * LE RELAIS KALYX (Worker Cloudflare) vu des clients : les fournisseurs à clé
 * (Alchemy, Helius, CoinGecko, LI.FI, Relay.link, Etherscan)
 * passent par lui, la clé reste côté serveur.
 *
 * Activé par `EXPO_PUBLIC_KALYX_RELAY_URL` (l'extension le fixe à la
 * construction). Vide : rien ne change, les clés éventuelles sont utilisées
 * comme avant.
 *
 * DISJONCTEUR : quand le relais répond « quota » (503) ou « trop de
 * requêtes » (429), ou quand il est injoignable (Worker au bout de son quota
 * gratuit), les clients se mettent en PAUSE sur lui le temps indiqué et
 * passent à leurs replis gratuits (nœuds publics) — sans le rappeler en boucle,
 * ce qui épuiserait son quota encore plus vite.
 */
export const RELAY_URL: string = (process.env.EXPO_PUBLIC_KALYX_RELAY_URL ?? '').replace(/\/+$/, '');

export type RelayService = 'alchemy' | 'helius' | 'coingecko' | 'lifi' | 'relaylink' | 'etherscan' | 'heliusapi';

const pausedUntil = new Map<RelayService, number>();
const DEFAULT_PAUSE_S = 300;
/** Délai laissé au relais avant de passer à l'appel direct (lectures). */
export const RELAY_TIMEOUT_MS = 5_000;
/** Devis de swap : le fournisseur lui-même peut prendre plusieurs secondes. */
export const RELAY_QUOTE_TIMEOUT_MS = 15_000;
const MAX_PAUSE_S = 3_600;

export function relayPaused(service: RelayService, now = Date.now()): boolean {
  return (pausedUntil.get(service) ?? 0) > now;
}

export function pauseRelay(service: RelayService, seconds = DEFAULT_PAUSE_S, now = Date.now()): void {
  const s = Number.isFinite(seconds) && seconds > 0 ? Math.min(seconds, MAX_PAUSE_S) : DEFAULT_PAUSE_S;
  pausedUntil.set(service, Math.max(pausedUntil.get(service) ?? 0, now + s * 1000));
}

/** Pour les tests. */
export function resetRelayPauses(): void {
  pausedUntil.clear();
}

/** URL qui passe par le relais. */
export const isRelayUrl = (u: string): boolean => !!RELAY_URL && u.startsWith(`${RELAY_URL}/`);

/** Point d'accès Alchemy : direct (clé) ou par le relais. */
export const isAlchemyRpc = (u: string): boolean => u.includes('.alchemy.com') || /\/rpc\/alchemy\/[a-z0-9-]+$/.test(u);

/** Service d'une URL du relais (pour le disjoncteur). */
export const relayServiceOf = (u: string): RelayService | null => (!isRelayUrl(u) ? null : u.includes('/rpc/helius') ? 'helius' : 'alchemy');

/**
 * Réponse du relais qui doit mettre le client en pause : quota (503) ou débit
 * (429). Rend la durée (s), 0 sinon.
 */
export function pauseFromResponse(status: number, retryAfter: string | null): number {
  if (status !== 503 && status !== 429) return 0;
  const n = Number(retryAfter);
  return Number.isFinite(n) && n > 0 ? n : status === 429 ? 30 : DEFAULT_PAUSE_S;
}

/** Une réponse du relais : met le disjoncteur à jour, puis la rend telle quelle. */
export function noteRelayResponse(url: string, res: { status: number; headers: { get(k: string): string | null } }): void {
  const svc = relayServiceOf(url);
  if (!svc) return;
  const p = pauseFromResponse(res.status, res.headers.get('retry-after'));
  if (p) pauseRelay(svc, p);
}

/** Le relais n'a pas répondu du tout (Worker hors quota, réseau) : courte pause. */
export function noteRelayUnreachable(url: string): void {
  const svc = relayServiceOf(url);
  if (svc) pauseRelay(svc, 60);
}

/**
 * API REST par le relais (`relayPath` : `/cg/api/v3/…`, `/lifi/v1/…`…), avec
 * repli sur `direct` (l'accès public sans clé, ou `null` s'il n'y en a pas) :
 *  - pas de relais configuré, ou relais en pause pour ce service → `direct` ;
 *  - relais injoignable, saturé (503) ou débit dépassé (429) → pause, puis
 *    `direct` tout de suite : l'utilisateur n'attend pas la prochaine fois.
 *  - relais trop lent (`timeoutMs`) → même chose : on n'attend pas pour rien ;
 *  - appel direct en échec aussi → la copie de secours du relais (dernière
 *    réponse RÉELLE, d'âge borné côté relais), si elle a été jointe.
 * Rend `null` quand aucune voie n'est possible.
 */
export async function relayOrDirect(
  service: RelayService,
  relayPath: string,
  direct: (() => Promise<Response>) | null,
  init?: RequestInit,
  timeoutMs = RELAY_TIMEOUT_MS,
): Promise<Response | null> {
  if (RELAY_URL && !relayPaused(service)) {
    let res: Response | null = null;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    const outer = init?.signal;
    const onAbort = () => ctrl.abort();
    outer?.addEventListener?.('abort', onAbort);
    try {
      res = await fetch(`${RELAY_URL}${relayPath}`, { ...init, signal: ctrl.signal });
    } catch (e) {
      // Annulé par l'appelant : ni pause ni repli, l'appel n'est plus voulu.
      if (outer?.aborted) throw e;
      pauseRelay(service, 60);
    } finally {
      clearTimeout(timer);
      outer?.removeEventListener?.('abort', onAbort);
    }
    if (res) {
      const p = pauseFromResponse(res.status, res.headers.get('retry-after'));
      if (!p) return res;
      pauseRelay(service, p);
      // Copie de secours du relais (dernière réponse réelle, d'âge borné) : gardée pour le cas où l'appel direct échoue aussi.
      if (res.headers.get('x-kalyx-stale') === '1') {
        if (lastStale.size >= STALE_MAX_ENTRIES) lastStale.delete(lastStale.keys().next().value as string);
        lastStale.set(relayPath, { text: await res.text().catch(() => ''), at: Date.now() });
      }
    }
  }
  if (direct) {
    try {
      const res = await direct();
      if (res.ok) return res;
      const stale = staleFor(relayPath);
      return stale ?? res;
    } catch (e) {
      const stale = staleFor(relayPath);
      if (stale) return stale;
      throw e;
    }
  }
  return staleFor(relayPath);
}

/** Dernières copies de secours reçues du relais (mémoire seulement, 10 min). */
const lastStale = new Map<string, { text: string; at: number }>();
const STALE_KEEP_MS = 10 * 60_000;
const STALE_MAX_ENTRIES = 50;

function staleFor(relayPath: string): Response | null {
  const s = lastStale.get(relayPath);
  if (!s || !s.text || Date.now() - s.at > STALE_KEEP_MS) return null;
  return new Response(s.text, { status: 200, headers: { 'content-type': 'application/json', 'x-kalyx-stale': '1' } });
}

/** Pour les tests. */
export function resetRelayStale(): void {
  lastStale.clear();
}
