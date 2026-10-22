/**
 * ACHAT DE CRYPTO (Stripe, page hébergée crypto.link.com) — la partie serveur.
 *
 * Une session d'achat se crée avec la clé SECRÈTE du compte Stripe : elle vit
 * ici (`wrangler secret put STRIPE_SECRET_KEY`), jamais dans l'app ni dans
 * l'extension. Le mode suit la clé : `sk_test_…` (ou `rk_test_…`) = test,
 * `sk_live_…` = réel. Passer en réel = remplacer le secret, rien d'autre.
 *
 * Ce n'est pas un relais ouvert vers l'API Stripe :
 *  - le worker CONSTRUIT lui-même le formulaire, à partir d'une liste fermée
 *    de champs validés un par un ; rien de la demande n'est recopié tel quel ;
 *  - le réseau et la crypto sont VERROUILLÉS (une seule valeur possible) : la
 *    page Stripe livre sur l'adresse et le réseau choisis dans Kalyx ;
 *  - l'IP de l'appareil est transmise (`customer_ip_address`) : Stripe refuse
 *    d'emblée un pays non couvert ;
 *  - aucune commission ajoutée par Kalyx.
 *
 *   POST /stripe/session { network, currency, address, sourceCurrency?, sourceAmount? } → { id, url, status, livemode }
 *   GET  /stripe/session?id=cos_…                                                     → { id, status, … }
 *
 * Pur et testable (Workers et Node).
 */

export const STRIPE_API = 'https://api.stripe.com/v1';

/** Réseaux de la page Stripe que Kalyx sait recevoir, et le format d'adresse de chacun. */
const EVM = /^0x[0-9a-fA-F]{40}$/;
export const NETWORKS: Record<string, RegExp> = {
  ethereum: EVM,
  base: EVM,
  polygon: EVM,
  avalanche: EVM,
  solana: /^[1-9A-HJ-NP-Za-km-z]{32,44}$/,
  bitcoin: /^(?:bc1[02-9ac-hj-np-z]{11,87}|[13][1-9A-HJ-NP-Za-km-z]{25,34}|tb1[02-9ac-hj-np-z]{11,87}|[mn2][1-9A-HJ-NP-Za-km-z]{25,34})$/,
};

const CURRENCY = /^[a-z0-9]{2,12}$/;
const FIAT = new Set(['usd', 'eur']);

export type Checked<T> = { ok: true; value: T } | { ok: false; error: string };

/** Le mode d'une clé Stripe ; `null` si ce n'est pas une clé secrète (ou restreinte) reconnue. */
export function keyMode(key: string | undefined): 'test' | 'live' | null {
  const m = /^(?:sk|rk)_(test|live)_[A-Za-z0-9]{10,}$/.exec(key?.trim() ?? '');
  return m ? (m[1] as 'test' | 'live') : null;
}

/** Valide la demande et en tire le formulaire de création de session, dans l'ordre. */
export function sessionForm(input: unknown, clientIp: string | null): Checked<[string, string][]> {
  if (!input || typeof input !== 'object') return { ok: false, error: 'bad body' };
  const i = input as Record<string, unknown>;
  const str = (k: string) => (typeof i[k] === 'string' ? (i[k] as string).trim() : undefined);

  const network = str('network')?.toLowerCase();
  if (!network || !Object.hasOwn(NETWORKS, network)) return { ok: false, error: 'bad network' };
  const address = str('address');
  if (!address || !NETWORKS[network].test(address)) return { ok: false, error: 'bad address' };
  const currency = str('currency')?.toLowerCase();
  if (!currency || !CURRENCY.test(currency)) return { ok: false, error: 'bad currency' };

  const out: [string, string][] = [
    [`wallet_addresses[${network}]`, address],
    // Une seule valeur = verrouillée : la page ne propose ni un autre réseau, ni une autre crypto.
    ['destination_networks[]', network],
    ['destination_network', network],
    ['destination_currencies[]', currency],
    ['destination_currency', currency],
  ];

  const fiat = str('sourceCurrency')?.toLowerCase();
  if (fiat !== undefined && !FIAT.has(fiat)) return { ok: false, error: 'bad sourceCurrency' };
  if (fiat) out.push(['source_currency', fiat]);
  const raw = i.sourceAmount;
  if (raw !== undefined && raw !== null && raw !== '') {
    const n = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : NaN;
    if (!Number.isFinite(n) || n <= 0 || n > 100_000) return { ok: false, error: 'bad sourceAmount' };
    if (!fiat) return { ok: false, error: 'sourceCurrency required' };
    out.push(['source_amount', (Math.round(n * 100) / 100).toFixed(2)]);
  }
  if (clientIp) out.push(['customer_ip_address', clientIp]);
  return { ok: true, value: out };
}

/** Corps `application/x-www-form-urlencoded` (format de l'API Stripe). */
export const formBody = (pairs: readonly [string, string][]) => pairs.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');

const SESSION_ID = /^cos_[A-Za-z0-9]{8,64}$/;
export const isSessionId = (s: string | null | undefined) => SESSION_ID.test(String(s ?? ''));

export interface OnrampSession {
  id: string;
  status: string;
  livemode: boolean;
  /** Page Stripe (crypto.link.com) où envoyer l'utilisateur. */
  url: string | null;
  destinationCurrency: string | null;
  destinationNetwork: string | null;
  destinationAmount: string | null;
  sourceAmount: string | null;
  sourceCurrency: string | null;
  /** Hachage de la transaction de livraison, quand elle existe. */
  transactionId: string | null;
}

/** Lien vers une page Stripe (crypto.link.com, *.stripe.com) en HTTPS, rien d'autre. */
export function isHostedUrl(u: string): boolean {
  try {
    const x = new URL(u);
    const h = x.hostname.toLowerCase();
    return x.protocol === 'https:' && !x.username && !x.password && (h === 'link.com' || h.endsWith('.link.com') || h.endsWith('.stripe.com'));
  } catch {
    return false;
  }
}

const STATUSES = new Set(['initialized', 'rejected', 'requires_payment', 'fulfillment_processing', 'fulfillment_complete']);

/** Session Stripe réduite à ce que Kalyx lit ; `null` si la réponse n'en est pas une. */
export function trimSession(raw: unknown): OnrampSession | null {
  if (!raw || typeof raw !== 'object') return null;
  const s = raw as Record<string, unknown>;
  if (typeof s.id !== 'string' || !isSessionId(s.id) || typeof s.status !== 'string' || !STATUSES.has(s.status)) return null;
  const td = (s.transaction_details ?? {}) as Record<string, unknown>;
  const str = (v: unknown, max = 120) => (typeof v === 'string' && v ? v.slice(0, max) : typeof v === 'number' && Number.isFinite(v) ? String(v) : null);
  const url = typeof s.redirect_url === 'string' && isHostedUrl(s.redirect_url) ? s.redirect_url : null;
  return {
    id: s.id,
    status: s.status,
    livemode: s.livemode === true,
    url,
    destinationCurrency: str(td.destination_currency, 20),
    destinationNetwork: str(td.destination_network, 30),
    destinationAmount: str(td.destination_amount, 40),
    sourceAmount: str(td.source_amount, 40),
    sourceCurrency: str(td.source_currency, 10),
    transactionId: str(td.transaction_id),
  };
}

/** Message d'erreur de Stripe (sans rien d'autre de la réponse). */
export function stripeError(raw: unknown): string {
  const e = (raw as { error?: { message?: unknown; code?: unknown } } | null)?.error;
  if (typeof e?.code === 'string' && /^[a-z_]{2,60}$/.test(e.code)) return e.code;
  return typeof e?.message === 'string' ? e.message.slice(0, 200) : 'stripe error';
}
