/**
 * ACHETER (Stripe, page hébergée crypto.link.com).
 *
 * Aucune clé ici : le relais Kalyx crée la session avec la clé secrète, pour
 * l'adresse du compte ACTIF, sur le réseau et la crypto choisis (verrouillés
 * par le relais). L'extension ne fait qu'ouvrir la page Stripe dans un onglet.
 * Le mode (test ou réel) suit la clé posée sur le relais.
 */
import { RELAY_URL } from '../../src/domain/net/relay';
import type { Home } from './home';
import { embeddedChainLogo, embeddedTokenLogo } from '../../src/domain/chains/icons';
import { chainLogo } from './portfolio';

/** Ce qu'on propose : des couples crypto/réseau que Stripe livre. */
export const BUY_OPTIONS = [
  { id: 'usdc-base', symbol: 'USDC', currency: 'usdc', network: 'base', chain: 'Base', family: 'evm' },
  { id: 'eth-ethereum', symbol: 'ETH', currency: 'eth', network: 'ethereum', chain: 'Ethereum', family: 'evm' },
  { id: 'eth-base', symbol: 'ETH', currency: 'eth', network: 'base', chain: 'Base', family: 'evm' },
  { id: 'usdc-ethereum', symbol: 'USDC', currency: 'usdc', network: 'ethereum', chain: 'Ethereum', family: 'evm' },
  { id: 'sol-solana', symbol: 'SOL', currency: 'sol', network: 'solana', chain: 'Solana', family: 'solana' },
  { id: 'usdc-solana', symbol: 'USDC', currency: 'usdc', network: 'solana', chain: 'Solana', family: 'solana' },
] as const;

export type BuyOption = (typeof BUY_OPTIONS)[number];

/** Logo embarqué de la crypto (SVG de l'app, en data URL : aucune image distante). */
function tokenLogo(symbol: string): string | undefined {
  const svg = embeddedChainLogo(embeddedTokenLogo(symbol));
  return svg ? `data:image/svg+xml,${encodeURIComponent(svg)}` : undefined;
}

export class BuyError extends Error {}

/** Lien de la page Stripe en HTTPS (crypto.link.com, *.stripe.com), rien d'autre. */
export function isHostedUrl(u: unknown): u is string {
  if (typeof u !== 'string') return false;
  try {
    const x = new URL(u);
    const host = x.hostname.toLowerCase();
    return x.protocol === 'https:' && !x.username && !x.password && (host === 'link.com' || host.endsWith('.link.com') || host.endsWith('.stripe.com'));
  } catch {
    return false;
  }
}

export function makeBuy(home: Pick<Home, 'current'>, opts: { relay?: string; fetch?: typeof fetch } = {}) {
  const relay = opts.relay ?? RELAY_URL;
  const doFetch = opts.fetch ?? ((...a: Parameters<typeof fetch>) => fetch(...a));

  /** Les options possibles pour le compte actif (une adresse de la bonne famille). */
  async function options(): Promise<{ id: string; symbol: string; chain: string; logo?: string; chainLogo?: string }[]> {
    const cur = await home.current();
    if (!cur) return [];
    return BUY_OPTIONS.filter((o) => !!cur.acct[o.family]).map(({ id, symbol, chain, network }) => ({ id, symbol, chain, logo: tokenLogo(symbol), chainLogo: chainLogo(network) }));
  }

  async function stripeUrl(optionId: unknown): Promise<{ url: string; mode: 'test' | 'live' }> {
    const o = BUY_OPTIONS.find((x) => x.id === optionId);
    if (!o) throw new BuyError('BAD_REQUEST');
    const cur = await home.current();
    const address = cur?.acct[o.family];
    if (!address) throw new BuyError('NO_ACCOUNT');
    if (!relay) throw new BuyError('BUY_UNAVAILABLE');
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 15_000);
    try {
      const res = await doFetch(`${relay}/stripe/session`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ network: o.network, currency: o.currency, address }),
        signal: ctrl.signal,
      });
      const body = (await res.json().catch(() => null)) as { url?: unknown; mode?: unknown; error?: unknown } | null;
      if (!res.ok || !body || !isHostedUrl(body.url)) throw new BuyError(typeof body?.error === 'string' ? body.error.slice(0, 120) : 'BUY_UNAVAILABLE');
      return { url: body.url, mode: body.mode === 'live' ? 'live' : 'test' };
    } catch (e) {
      if (e instanceof BuyError) throw e;
      throw new BuyError('BUY_UNAVAILABLE');
    } finally {
      clearTimeout(timer);
    }
  }

  return { options, stripeUrl };
}

export type Buy = ReturnType<typeof makeBuy>;
