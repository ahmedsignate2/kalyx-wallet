/**
 * Achat de crypto (Stripe, page hébergée crypto.link.com) — appels au relais.
 *
 * L'app ne connaît AUCUNE clé Stripe : le relais (ton-proxy, route
 * /stripe/session) crée la session avec la clé secrète, pour l'adresse et le
 * réseau choisis ici (verrouillés), et renvoie le lien de la page Stripe.
 * Le mode (test ou réel) suit la clé posée sur le relais.
 */
import { TON_PROXY_URL } from '../src/domain/chains/ton/tonProxy';
import type { RampTx } from './moonpay';

const BASE = (process.env.EXPO_PUBLIC_RAMP_PROXY_URL || TON_PROXY_URL).replace(/\/+$/, '');

/** Réseau Kalyx → réseau de la page Stripe (ceux que le relais accepte). */
const NETWORK: Record<string, string> = {
  ethereum: 'ethereum',
  base: 'base',
  polygon: 'polygon',
  avalanche: 'avalanche',
  solana: 'solana',
  bitcoin: 'bitcoin',
};

export const stripeNetworkOf = (chainId: string): string | null => NETWORK[chainId] ?? null;

export const isStripeSessionId = (id: string | null | undefined) => /^cos_[A-Za-z0-9]{8,64}$/.test(String(id ?? ''));

export interface StripeSession {
  id: string;
  status: 'initialized' | 'rejected' | 'requires_payment' | 'fulfillment_processing' | 'fulfillment_complete';
  mode: 'test' | 'live';
  url: string | null;
  destinationAmount: string | null;
  sourceAmount: string | null;
  transactionId: string | null;
}

export class StripeRampError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15_000);
  try {
    const res = await fetch(`${BASE}${path}`, { ...init, signal: ctrl.signal, headers: { accept: 'application/json', ...(init?.body ? { 'content-type': 'application/json' } : {}) } });
    const body = (await res.json().catch(() => null)) as (T & { error?: string }) | null;
    if (!res.ok || !body) throw new StripeRampError(body?.error ?? `HTTP ${res.status}`, res.status);
    return body;
  } finally {
    clearTimeout(timer);
  }
}

/** Session d'achat pour CETTE adresse, sur CE réseau, pour CETTE crypto (verrouillés). */
export function createStripeSession(p: { chainId: string; symbol: string; address: string; fiat: string; amount: number }): Promise<StripeSession> {
  const network = stripeNetworkOf(p.chainId);
  if (!network) return Promise.reject(new StripeRampError('unsupported network', 400));
  const fiat = p.fiat.toLowerCase();
  return call<StripeSession>('/stripe/session', {
    method: 'POST',
    body: JSON.stringify({
      network,
      currency: p.symbol.toLowerCase(),
      address: p.address,
      // Stripe n'accepte que l'USD et l'EUR : sinon il propose lui-même la devise.
      ...(fiat === 'usd' || fiat === 'eur' ? { sourceCurrency: fiat, sourceAmount: p.amount } : {}),
    }),
  });
}

export function stripeSession(id: string): Promise<StripeSession> {
  return call<StripeSession>(`/stripe/session?id=${encodeURIComponent(id)}`);
}

/** Statut Stripe → statut du suivi d'achat (celui de MoonPay, que l'écran sait lire). */
export function stripeStatus(s: StripeSession['status']): 'completed' | 'failed' | 'pending' | 'waitingPayment' {
  if (s === 'fulfillment_complete') return 'completed';
  if (s === 'rejected') return 'failed';
  if (s === 'fulfillment_processing') return 'pending';
  return 'waitingPayment';
}

/** Une session Stripe vue comme une commande du suivi d'achat. */
export function stripeAsRampTx(s: StripeSession): RampTx {
  const num = (v: string | null) => (v != null && Number.isFinite(Number(v)) ? Number(v) : null);
  return {
    id: s.id,
    status: stripeStatus(s.status),
    createdAt: null,
    baseCurrencyAmount: num(s.sourceAmount),
    quoteCurrencyAmount: num(s.destinationAmount),
    feeAmount: null,
    networkFeeAmount: null,
    cryptoTransactionId: s.transactionId,
    walletAddress: null,
    currencyCode: null,
    failureReason: null,
    stages: [],
  };
}

/** Le suivi d'une commande, quel que soit le fournisseur (identifiant `cos_…` = Stripe). */
export async function stripeOrMoonpayTx(id: string, moonpay: (id: string) => Promise<RampTx>): Promise<RampTx> {
  return isStripeSessionId(id) ? stripeAsRampTx(await stripeSession(id)) : moonpay(id);
}
