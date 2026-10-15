/**
 * ACHAT DE CRYPTO (MoonPay) — la partie qui doit rester côté serveur.
 *
 * Le widget MoonPay exige une SIGNATURE dès qu'on lui passe l'adresse du
 * portefeuille (sinon n'importe qui pourrait fabriquer un lien qui envoie les
 * fonds achetés ailleurs). Cette signature se calcule avec la clé SECRÈTE du
 * compte MoonPay : elle vit ici (`wrangler secret put MOONPAY_SECRET_KEY`),
 * jamais dans l'app.
 *
 * Ce n'est pas un signeur ouvert :
 *  - le worker CONSTRUIT lui-même l'URL, à partir d'une liste fermée de
 *    paramètres validés un par un ; il ne signe jamais une URL reçue ;
 *  - l'URL est liée à l'IP de l'appareil qui la demande (`allowedIpAddress`,
 *    obligatoire chez MoonPay pour la production) : un lien volé ou envoyé à
 *    quelqu'un d'autre ne s'ouvre pas chez lui ;
 *  - aucun paramètre de commission : Kalyx n'ajoute aucun frais caché.
 *
 *   GET  /moonpay/currencies                 → actifs et devises (cache 1 h)
 *   GET  /moonpay/quote?currencyCode=…&…      → devis d'achat
 *   POST /moonpay/url  { currencyCode, walletAddress, … } → { url } signée
 *
 * Pur et testable (WebCrypto : Workers et Node).
 */

export type MoonpayEnvName = 'sandbox' | 'production';

export const WIDGET_HOST: Record<MoonpayEnvName, string> = {
  sandbox: 'https://buy-sandbox.moonpay.com',
  production: 'https://buy.moonpay.com',
};
export const API_HOST = 'https://api.moonpay.com';

/** Moyens de paiement acceptés en pré-sélection (liste MoonPay). */
export const PAYMENT_METHODS = [
  'credit_debit_card',
  'apple_pay',
  'google_pay',
  'sepa_bank_transfer',
  'gbp_bank_transfer',
  'gbp_open_banking_payment',
  'pix_instant_payment',
  'paypal',
  'revolut_pay',
  'venmo',
] as const;

const CURRENCY = /^[a-z0-9_]{2,24}$/;
const FIAT = /^[a-z]{3}$/;
/** Adresses : jeu de caractères des formats pris en charge (EVM, BTC, SOL, TON…). */
const ADDRESS = /^[A-Za-z0-9:_-]{20,110}$/;

export interface BuyUrlInput {
  currencyCode: string;
  walletAddress: string;
  baseCurrencyCode?: string;
  baseCurrencyAmount?: string | number;
  paymentMethod?: string;
  theme?: string;
  email?: string;
}

export type Checked<T> = { ok: true; value: T } | { ok: false; error: string };

/** Valide la demande de l'app et en tire les paramètres du widget, dans l'ordre. */
export function buyParams(input: unknown, apiKey: string): Checked<[string, string][]> {
  if (!input || typeof input !== 'object') return { ok: false, error: 'bad body' };
  const i = input as Record<string, unknown>;
  const str = (k: string) => (typeof i[k] === 'string' ? (i[k] as string).trim() : i[k] === undefined || i[k] === null ? undefined : null);

  const currencyCode = str('currencyCode')?.toLowerCase();
  if (!currencyCode || !CURRENCY.test(currencyCode)) return { ok: false, error: 'bad currencyCode' };
  const walletAddress = str('walletAddress');
  if (!walletAddress || !ADDRESS.test(walletAddress)) return { ok: false, error: 'bad walletAddress' };

  const out: [string, string][] = [
    ['apiKey', apiKey],
    ['currencyCode', currencyCode],
    ['walletAddress', walletAddress],
  ];

  const base = str('baseCurrencyCode');
  if (base === null) return { ok: false, error: 'bad baseCurrencyCode' };
  if (base !== undefined) {
    if (!FIAT.test(base.toLowerCase())) return { ok: false, error: 'bad baseCurrencyCode' };
    out.push(['baseCurrencyCode', base.toLowerCase()]);
  }
  const rawAmount = i.baseCurrencyAmount;
  if (rawAmount !== undefined && rawAmount !== null && rawAmount !== '') {
    const n = typeof rawAmount === 'number' ? rawAmount : typeof rawAmount === 'string' ? Number(rawAmount) : NaN;
    if (!Number.isFinite(n) || n <= 0 || n > 1_000_000) return { ok: false, error: 'bad baseCurrencyAmount' };
    if (!base) return { ok: false, error: 'baseCurrencyCode required' };
    out.push(['baseCurrencyAmount', String(Math.round(n * 100) / 100)]);
  }
  const pm = str('paymentMethod');
  if (pm === null || (pm !== undefined && !(PAYMENT_METHODS as readonly string[]).includes(pm))) return { ok: false, error: 'bad paymentMethod' };
  if (pm) out.push(['paymentMethod', pm]);
  const theme = str('theme');
  if (theme === 'light' || theme === 'dark') out.push(['theme', theme]);
  const email = str('email');
  if (email) {
    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, error: 'bad email' };
    out.push(['email', email]);
  }
  return { ok: true, value: out };
}

/** Chaîne de requête ENCODÉE (avec le « ? ») : exactement ce qui est signé et envoyé. */
export function queryOf(params: readonly [string, string][]): string {
  return '?' + params.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
}

export async function hmacBase64(secret: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(message)));
  let bin = '';
  for (const b of sig) bin += String.fromCharCode(b);
  return btoa(bin);
}

/**
 * Forme canonique d'une IP (ce que MoonPay hache de son côté) : IPv4 en
 * pointé-décimal sans zéros de tête, IPv4 « mappée » ramenée à l'IPv4, IPv6
 * selon la RFC 5952. `null` si ce n'est pas une IP.
 */
export function canonicalIp(raw: string | null | undefined): string | null {
  let s = String(raw ?? '').trim();
  if (!s) return null;
  // [v6]:port, ou v4:port
  const br = /^\[([^\]]+)\](?::\d+)?$/.exec(s);
  if (br) s = br[1];
  else if (/^\d{1,3}(?:\.\d{1,3}){3}:\d+$/.test(s)) s = s.split(':')[0];
  s = s.replace(/%.*$/, '').toLowerCase();

  const v4 = (x: string) => {
    const p = x.split('.');
    if (p.length !== 4 || p.some((o) => !/^\d{1,3}$/.test(o) || Number(o) > 255)) return null;
    return p.map((o) => String(Number(o))).join('.');
  };
  if (!s.includes(':')) return v4(s);

  // IPv6 → 8 groupes de 16 bits (une IPv4 en fin d'adresse = 2 groupes)
  const lastColon = s.lastIndexOf(':');
  if (s.slice(lastColon + 1).includes('.')) {
    const four = v4(s.slice(lastColon + 1));
    if (!four) return null;
    const o = four.split('.').map(Number);
    s = `${s.slice(0, lastColon + 1)}${((o[0] << 8) | o[1]).toString(16)}:${((o[2] << 8) | o[3]).toString(16)}`;
  }
  const halves = s.split('::');
  if (halves.length > 2) return null;
  const parse = (h: string) => (h === '' ? [] : h.split(':'));
  const head = parse(halves[0]);
  const rest = halves.length === 2 ? parse(halves[1]) : [];
  if ([...head, ...rest].some((g) => !/^[0-9a-f]{1,4}$/.test(g))) return null;
  const fill = halves.length === 2 ? 8 - head.length - rest.length : 0;
  if (halves.length === 2 ? fill < 1 : head.length !== 8) return null;
  const groups = [...head, ...Array(fill).fill('0'), ...rest].map((g) => parseInt(g, 16));

  // IPv4 mappée (::ffff:a.b.c.d) → IPv4
  if (groups.slice(0, 5).every((g) => g === 0) && groups[5] === 0xffff) {
    return [groups[6] >> 8, groups[6] & 255, groups[7] >> 8, groups[7] & 255].join('.');
  }
  // Plus longue suite de zéros (≥ 2 groupes), la première en cas d'égalité.
  let best = -1, bestLen = 0;
  for (let i = 0; i < 8; ) {
    if (groups[i] !== 0) { i++; continue; }
    let j = i;
    while (j < 8 && groups[j] === 0) j++;
    if (j - i > bestLen && j - i >= 2) { best = i; bestLen = j - i; }
    i = j;
  }
  const hex = groups.map((g) => g.toString(16));
  if (best < 0) return hex.join(':');
  return `${hex.slice(0, best).join(':')}::${hex.slice(best + bestLen).join(':')}`;
}

/** URL du widget, signée, liée à l'IP si on la connaît. */
export async function signedBuyUrl(opts: {
  env: MoonpayEnvName;
  params: [string, string][];
  secret: string;
  clientIp?: string | null;
  ipMatch?: boolean;
  redirectURL?: string;
}): Promise<string> {
  const params = [...opts.params];
  if (opts.redirectURL) params.push(['redirectURL', opts.redirectURL]);
  const ip = opts.ipMatch === false ? null : canonicalIp(opts.clientIp);
  if (ip) params.push(['allowedIpAddress', await hmacBase64(opts.secret, ip)]);
  const query = queryOf(params);
  const signature = await hmacBase64(opts.secret, query);
  return `${WIDGET_HOST[opts.env]}/${query}&signature=${encodeURIComponent(signature)}`;
}

/* ── Réponses de l'API publique, réduites à ce que l'app lit ───────────── */

export interface RampCurrency {
  type: 'crypto' | 'fiat';
  code: string;
  name: string;
  minBuyAmount: number | null;
  maxBuyAmount: number | null;
  networkCode?: string | null;
  chainId?: string | null;
  contractAddress?: string | null;
  supportsTestMode?: boolean;
  isSuspended?: boolean;
}

export function trimCurrencies(raw: unknown): RampCurrency[] {
  if (!Array.isArray(raw)) return [];
  const out: RampCurrency[] = [];
  for (const c of raw as Record<string, unknown>[]) {
    if (!c || (c.type !== 'crypto' && c.type !== 'fiat') || typeof c.code !== 'string') continue;
    const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
    const meta = (c.metadata ?? {}) as Record<string, unknown>;
    const s = (v: unknown) => (typeof v === 'string' ? v : null);
    out.push({
      type: c.type,
      code: c.code,
      name: typeof c.name === 'string' ? c.name : c.code,
      minBuyAmount: num(c.minBuyAmount),
      maxBuyAmount: num(c.maxBuyAmount),
      ...(c.type === 'crypto'
        ? {
            networkCode: s(meta.networkCode),
            chainId: s(meta.chainId),
            contractAddress: s(meta.contractAddress),
            supportsTestMode: c.supportsTestMode === true,
            isSuspended: c.isSuspended === true,
          }
        : {}),
    });
  }
  return out;
}

export interface RampQuote {
  quoteCurrencyAmount: number;
  baseCurrencyAmount: number;
  feeAmount: number;
  networkFeeAmount: number;
  extraFeeAmount: number;
  totalAmount: number;
}

export function trimQuote(raw: unknown): RampQuote | null {
  if (!raw || typeof raw !== 'object') return null;
  const q = raw as Record<string, unknown>;
  const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : NaN);
  const out = {
    quoteCurrencyAmount: n(q.quoteCurrencyAmount),
    baseCurrencyAmount: n(q.baseCurrencyAmount),
    feeAmount: n(q.feeAmount),
    networkFeeAmount: n(q.networkFeeAmount),
    extraFeeAmount: Number.isFinite(n(q.extraFeeAmount)) ? n(q.extraFeeAmount) : 0,
    totalAmount: n(q.totalAmount),
  };
  return Object.values(out).every(Number.isFinite) ? out : null;
}

/** Paramètres du devis, validés ; `null` si la demande est mal formée. */
export function quoteQuery(sp: URLSearchParams, apiKey: string): { code: string; query: string } | null {
  const code = (sp.get('currencyCode') ?? '').toLowerCase();
  const base = (sp.get('baseCurrencyCode') ?? '').toLowerCase();
  const amount = Number(sp.get('baseCurrencyAmount') ?? '');
  const pm = sp.get('paymentMethod');
  if (!CURRENCY.test(code) || !FIAT.test(base) || !Number.isFinite(amount) || amount <= 0 || amount > 1_000_000) return null;
  if (pm && !(PAYMENT_METHODS as readonly string[]).includes(pm)) return null;
  const p: [string, string][] = [
    ['apiKey', apiKey],
    ['baseCurrencyCode', base],
    ['baseCurrencyAmount', String(amount)],
    ['areFeesIncluded', 'true'],
  ];
  if (pm) p.push(['paymentMethod', pm]);
  return { code, query: queryOf(p) };
}

/* ── Suivi d'une commande ──────────────────────────────────────────────── */

export interface RampTxStage {
  stage: string;
  status: string;
}

export interface RampTx {
  id: string;
  status: string;
  createdAt: string | null;
  baseCurrencyAmount: number | null;
  quoteCurrencyAmount: number | null;
  feeAmount: number | null;
  networkFeeAmount: number | null;
  cryptoTransactionId: string | null;
  walletAddress: string | null;
  currencyCode: string | null;
  failureReason: string | null;
  stages: RampTxStage[];
}

const TX_ID = /^[A-Za-z0-9-]{8,64}$/;
export const isTxId = (s: string | null | undefined) => TX_ID.test(String(s ?? ''));

/** Commande MoonPay réduite à ce que l'écran de suivi affiche. */
export function trimTx(raw: unknown): RampTx | null {
  if (!raw || typeof raw !== 'object') return null;
  const t = raw as Record<string, unknown>;
  if (typeof t.id !== 'string' || typeof t.status !== 'string') return null;
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  const str = (v: unknown, max = 200) => (typeof v === 'string' ? v.slice(0, max) : null);
  const cur = (t.currency ?? {}) as Record<string, unknown>;
  const stages = Array.isArray(t.stages)
    ? (t.stages as Record<string, unknown>[])
        .filter((s) => s && typeof s.stage === 'string' && typeof s.status === 'string')
        .map((s) => ({ stage: s.stage as string, status: s.status as string }))
    : [];
  return {
    id: t.id,
    status: t.status,
    createdAt: str(t.createdAt, 40),
    baseCurrencyAmount: num(t.baseCurrencyAmount),
    quoteCurrencyAmount: num(t.quoteCurrencyAmount),
    feeAmount: num(t.feeAmount),
    networkFeeAmount: num(t.networkFeeAmount),
    cryptoTransactionId: str(t.cryptoTransactionId, 120),
    walletAddress: str(t.walletAddress, 120),
    currencyCode: str(cur.code, 30),
    failureReason: str(t.failureReason),
    stages,
  };
}

/** Pays de l'appareil : l'achat y est-il permis ? */
export function trimRegion(raw: unknown): { country: string | null; isBuyAllowed: boolean } | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.isBuyAllowed !== 'boolean') return null;
  return { country: typeof r.alpha2 === 'string' ? r.alpha2.slice(0, 3) : null, isBuyAllowed: r.isBuyAllowed && r.isAllowed !== false };
}
