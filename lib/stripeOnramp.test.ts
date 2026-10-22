import { createStripeSession, isStripeSessionId, stripeAsRampTx, stripeNetworkOf, stripeOrMoonpayTx, stripeStatus, type StripeSession } from './stripeOnramp';
import { buyProgress } from '../src';

const EVM = '0x9858EfFD232B4033E47d90003D41EC34EcaEda94';
const session = (over: Partial<StripeSession> = {}): StripeSession => ({ id: 'cos_0MYfrA589O8KAxCGEDaIVYAB', status: 'initialized', mode: 'test', url: null, destinationAmount: null, sourceAmount: null, transactionId: null, ...over });

describe('achat Stripe (client de l’app)', () => {
  afterEach(() => jest.restoreAllMocks());

  test('réseaux pris en charge, les autres non', () => {
    expect(stripeNetworkOf('base')).toBe('base');
    expect(stripeNetworkOf('solana')).toBe('solana');
    expect(stripeNetworkOf('bsc')).toBeNull();
    expect(isStripeSessionId('cos_0MYfrA589O8KAxCGEDaIVYAB')).toBe(true);
    expect(isStripeSessionId('a1b2c3d4-e5f6')).toBe(false);
  });

  test('session : réseau, crypto et adresse envoyés au relais, montant seulement en USD/EUR', async () => {
    const calls: { url: string; body: unknown }[] = [];
    jest.spyOn(global, 'fetch').mockImplementation(async (url, init) => {
      calls.push({ url: String(url), body: JSON.parse(String(init?.body)) });
      return new Response(JSON.stringify(session({ url: 'https://crypto.link.com?session_hash=x' })), { status: 200 });
    });
    await createStripeSession({ chainId: 'base', symbol: 'USDC', address: EVM, fiat: 'EUR', amount: 50 });
    await createStripeSession({ chainId: 'ethereum', symbol: 'ETH', address: EVM, fiat: 'gbp', amount: 50 });
    expect(calls[0].url).toMatch(/\/stripe\/session$/);
    expect(calls[0].body).toEqual({ network: 'base', currency: 'usdc', address: EVM, sourceCurrency: 'eur', sourceAmount: 50 });
    expect(calls[1].body).toEqual({ network: 'ethereum', currency: 'eth', address: EVM });
    await expect(createStripeSession({ chainId: 'bsc', symbol: 'BNB', address: EVM, fiat: 'usd', amount: 5 })).rejects.toThrow('unsupported network');
  });

  test('erreur du relais remontée telle quelle', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify({ error: 'crypto_onramp_unsupported_country' }), { status: 400 }));
    await expect(createStripeSession({ chainId: 'base', symbol: 'USDC', address: EVM, fiat: 'usd', amount: 5 })).rejects.toThrow('crypto_onramp_unsupported_country');
  });

  test('statuts Stripe → suivi d’achat', () => {
    expect(stripeStatus('fulfillment_complete')).toBe('completed');
    expect(stripeStatus('rejected')).toBe('failed');
    expect(buyProgress({ status: stripeStatus('fulfillment_processing') }).outcome).toBe('pending');
    expect(buyProgress({ status: stripeStatus('requires_payment') }).outcome).toBe('pending');
    const tx = stripeAsRampTx(session({ status: 'fulfillment_complete', destinationAmount: '24.9', sourceAmount: '25.00', transactionId: '0xabc' }));
    expect(tx).toMatchObject({ status: 'completed', quoteCurrencyAmount: 24.9, baseCurrencyAmount: 25, cryptoTransactionId: '0xabc' });
    expect(buyProgress(tx).outcome).toBe('completed');
  });

  test('suivi : identifiant Stripe → Stripe, sinon MoonPay', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify(session({ status: 'fulfillment_processing' })), { status: 200 }));
    const moonpay = jest.fn(async (id: string) => ({ ...stripeAsRampTx(session()), id }));
    expect((await stripeOrMoonpayTx('cos_0MYfrA589O8KAxCGEDaIVYAB', moonpay)).status).toBe('pending');
    expect(moonpay).not.toHaveBeenCalled();
    await stripeOrMoonpayTx('a1b2c3d4-e5f6-7890', moonpay);
    expect(moonpay).toHaveBeenCalledWith('a1b2c3d4-e5f6-7890');
  });
});
