import { describe, expect, test } from 'vitest';
import { isHostedUrl, makeBuy } from './buy';

const EVM = '0x9858EfFD232B4033E47d90003D41EC34EcaEda94';
const SOL = 'HAgk14JpMQLgt6rVgv7cBQFJWFto5Dqxi472uT3DKpqk';
const home = (acct: { evm?: string; solana?: string } | null) => ({ current: async () => (acct ? ({ wallet: {} as never, index: 0, acct }) : null) });
const reply = (status: number, body: unknown) => async () => new Response(JSON.stringify(body), { status });

describe('acheter (page Stripe)', () => {
  test('options selon le compte actif', async () => {
    expect((await makeBuy(home({ evm: EVM })).options()).map((o) => o.id)).toEqual(['usdc-base', 'eth-ethereum', 'eth-base', 'usdc-ethereum']);
    expect((await makeBuy(home({ solana: SOL })).options()).map((o) => o.id)).toEqual(['sol-solana', 'usdc-solana']);
    expect(await makeBuy(home(null)).options()).toEqual([]);
    // Logos embarqués (aucune image distante) : la crypto, et le réseau en pastille.
    for (const o of await makeBuy(home({ evm: EVM, solana: SOL })).options()) {
      expect(o.logo).toMatch(/^data:image\/svg\+xml,/);
      expect(o.chainLogo).toBeTruthy();
    }
  });

  test('session demandée au relais pour l’adresse ACTIVE, lien Stripe rendu', async () => {
    const calls: { url: string; body: unknown }[] = [];
    const buy = makeBuy(home({ evm: EVM, solana: SOL }), {
      relay: 'https://relais.exemple',
      fetch: async (url, init) => (calls.push({ url: String(url), body: JSON.parse(String(init?.body)) }), new Response(JSON.stringify({ url: 'https://crypto.link.com?session_hash=x', mode: 'test' }), { status: 200 })),
    });
    expect(await buy.stripeUrl('sol-solana')).toEqual({ url: 'https://crypto.link.com?session_hash=x', mode: 'test' });
    expect(calls).toEqual([{ url: 'https://relais.exemple/stripe/session', body: { network: 'solana', currency: 'sol', address: SOL } }]);
  });

  test('refus : option inconnue, pas d’adresse, lien étranger, relais en erreur', async () => {
    const ok = { relay: 'https://r.ex', fetch: reply(200, { url: 'https://crypto.link.com/x' }) };
    await expect(makeBuy(home({ evm: EVM }), ok).stripeUrl('btc-bitcoin')).rejects.toThrow('BAD_REQUEST');
    await expect(makeBuy(home({ evm: EVM }), ok).stripeUrl('sol-solana')).rejects.toThrow('NO_ACCOUNT');
    await expect(makeBuy(home({ evm: EVM }), { relay: 'https://r.ex', fetch: reply(200, { url: 'https://evil.example/x' }) }).stripeUrl('eth-base')).rejects.toThrow('BUY_UNAVAILABLE');
    await expect(makeBuy(home({ evm: EVM }), { relay: 'https://r.ex', fetch: reply(400, { error: 'crypto_onramp_unsupported_country' }) }).stripeUrl('eth-base')).rejects.toThrow('crypto_onramp_unsupported_country');
    await expect(makeBuy(home({ evm: EVM }), { relay: 'https://r.ex', fetch: async () => { throw new TypeError('offline'); } }).stripeUrl('eth-base')).rejects.toThrow('BUY_UNAVAILABLE');
    await expect(makeBuy(home({ evm: EVM }), { relay: '', fetch: reply(200, {}) }).stripeUrl('eth-base')).rejects.toThrow('BUY_UNAVAILABLE');
  });

  test('lien Stripe seulement', () => {
    expect(isHostedUrl('https://crypto.link.com?session_hash=x')).toBe(true);
    expect(isHostedUrl('https://crypto.link.com.evil.example/')).toBe(false);
    expect(isHostedUrl('http://crypto.link.com/')).toBe(false);
    expect(isHostedUrl('javascript:alert(1)')).toBe(false);
  });
});
