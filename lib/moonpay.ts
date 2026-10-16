/**
 * Achat de crypto (MoonPay) — appels au worker qui tient les clés.
 *
 * L'app ne connaît AUCUNE clé MoonPay : le worker (ton-proxy, routes
 * /moonpay/*) donne la liste des devises, les devis, et construit + signe
 * l'URL du widget pour l'adresse de l'utilisateur.
 */
import { TON_PROXY_URL } from '../src/domain/chains/ton/tonProxy';
import type { BuyPaymentMethod, RampCurrency } from '../src';

const BASE = (process.env.EXPO_PUBLIC_RAMP_PROXY_URL || TON_PROXY_URL).replace(/\/+$/, '');

/** Page de fin d'achat (doit égaler MOONPAY_REDIRECT_URL du worker). */
export const BUY_REDIRECT_URL = 'https://kalyxwallet.com/buy/complete';

export type RampEnv = 'sandbox' | 'production';

export interface RampQuote {
  quoteCurrencyAmount: number;
  baseCurrencyAmount: number;
  feeAmount: number;
  networkFeeAmount: number;
  extraFeeAmount: number;
  totalAmount: number;
}

/** Erreur du service, avec le message de MoonPay quand il y en a un. */
export class RampError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function call<T>(path: string, init?: RequestInit, timeoutMs = 15_000): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${BASE}${path}`, { ...init, signal: ctrl.signal, headers: { accept: 'application/json', ...(init?.body ? { 'content-type': 'application/json' } : {}) } });
    const body = (await res.json().catch(() => null)) as (T & { error?: string }) | null;
    if (!res.ok || !body) throw new RampError(body?.error ?? `HTTP ${res.status}`, res.status);
    return body;
  } finally {
    clearTimeout(timer);
  }
}

let cached: { at: number; value: { env: RampEnv; currencies: RampCurrency[] } } | null = null;

/** Devises MoonPay (gardées 30 min en mémoire). */
export async function rampCurrencies(): Promise<{ env: RampEnv; currencies: RampCurrency[] }> {
  if (cached && Date.now() - cached.at < 30 * 60_000) return cached.value;
  const value = await call<{ env: RampEnv; currencies: RampCurrency[] }>('/moonpay/currencies');
  cached = { at: Date.now(), value };
  return value;
}

export function rampQuote(p: { currencyCode: string; baseCurrencyCode: string; baseCurrencyAmount: number; paymentMethod?: BuyPaymentMethod }): Promise<RampQuote> {
  const q = new URLSearchParams({ currencyCode: p.currencyCode, baseCurrencyCode: p.baseCurrencyCode, baseCurrencyAmount: String(p.baseCurrencyAmount) });
  if (p.paymentMethod) q.set('paymentMethod', p.paymentMethod);
  return call<RampQuote>(`/moonpay/quote?${q.toString()}`);
}

/** URL du widget signée pour CETTE adresse (et liée à l'IP de l'appareil). */
export function rampWidgetUrl(p: {
  currencyCode: string;
  walletAddress: string;
  baseCurrencyCode: string;
  baseCurrencyAmount: number;
  paymentMethod: BuyPaymentMethod;
  theme: 'light' | 'dark';
  /** E-mail du compte MoonPay, prérempli dans le widget (signé avec le reste). */
  email?: string;
}): Promise<{ url: string; env: RampEnv }> {
  return call<{ url: string; env: RampEnv }>('/moonpay/url', { method: 'POST', body: JSON.stringify(p) });
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
  stages: { stage: string; status: string }[];
}

/** État d'une commande (après le retour du widget). */
export function rampTransaction(id: string): Promise<RampTx> {
  return call<RampTx>(`/moonpay/tx?id=${encodeURIComponent(id)}`);
}

/**
 * L'achat est-il permis dans le pays de l'appareil ? `null` si on ne sait pas
 * (service muet) : dans le doute on laisse essayer, le widget tranchera.
 */
export async function rampRegion(): Promise<{ country: string | null; isBuyAllowed: boolean } | null> {
  try {
    return await call<{ country: string | null; isBuyAllowed: boolean }>('/moonpay/region', undefined, 8_000);
  } catch {
    return null;
  }
}
