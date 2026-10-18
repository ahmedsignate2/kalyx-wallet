import { base58check, bech32m } from '@scure/base';
import { sha256 } from '@noble/hashes/sha2';
import { amountProblem, btcToTestnet, buyableAssets, buyTrackerUrl, isMoonpayHost, needsSystemBrowser, parseBuyRedirect, paymentMethodsFor, pickFiat, rampWalletAddress, type RampCurrency } from './moonpay';

const chains = [
  { id: 'ethereum', family: 'evm', evmChainId: 1 },
  { id: 'base', family: 'evm', evmChainId: 8453 },
  { id: 'sepolia', family: 'evm', evmChainId: 11155111, testnet: true },
  { id: 'bitcoin', family: 'bitcoin' },
  { id: 'solana', family: 'solana' },
];
const C = (code: string, extra: Partial<RampCurrency> = {}): RampCurrency => ({ type: 'crypto', code, name: code, minBuyAmount: null, maxBuyAmount: null, supportsTestMode: true, ...extra });

describe('achat MoonPay', () => {
  it('ne propose que ce qu’on sait recevoir', () => {
    const list = buyableAssets(
      [
        C('usdc_base', { chainId: '8453', networkCode: 'base', contractAddress: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' }),
        C('eth', { chainId: '1', networkCode: 'ethereum' }),
        C('btc', { networkCode: 'bitcoin' }),
        C('xrp', { networkCode: 'ripple' }), // réseau non géré
        C('eth_zk', { chainId: '324' }), // EVM inconnu
        C('sol', { networkCode: 'solana', isSuspended: true }),
        C('usdt', { chainId: '1', supportsTestMode: false }),
        { type: 'fiat', code: 'eur', name: 'Euro', minBuyAmount: 20, maxBuyAmount: 30000 },
      ],
      chains,
      { sandbox: true },
    );
    expect(list.map((a) => `${a.symbol}@${a.chainId}`)).toEqual(['USDC@base', 'BTC@bitcoin', 'ETH@ethereum']);
    expect(list[0].contract).toMatch(/^0x8335/);
    expect(list[2].contract).toBeNull();
  });

  it('hors bac à sable, les actifs sans mode test restent proposés', () => {
    expect(buyableAssets([C('usdt', { chainId: '1', supportsTestMode: false })], chains, { sandbox: false })).toHaveLength(1);
  });

  it('devise et bornes', () => {
    const fiats: RampCurrency[] = [
      { type: 'fiat', code: 'usd', name: 'Dollar', minBuyAmount: 20, maxBuyAmount: 10000 },
      { type: 'fiat', code: 'eur', name: 'Euro', minBuyAmount: 20, maxBuyAmount: 30000 },
    ];
    expect(pickFiat(fiats, 'EUR')?.code).toBe('eur');
    expect(pickFiat(fiats, 'jpy')?.code).toBe('eur');
    expect(amountProblem(10, fiats[1])).toBe('min');
    expect(amountProblem(40000, fiats[1])).toBe('max');
    expect(amountProblem(50, fiats[1])).toBeNull();
  });

  it('moyens de paiement : Apple Pay d’abord sur iOS, Google Pay hors vue web', () => {
    expect(paymentMethodsFor('ios', 'eur')).toEqual(['apple_pay', 'credit_debit_card', 'sepa_bank_transfer']);
    expect(paymentMethodsFor('android', 'usd')).toEqual(['credit_debit_card', 'google_pay']);
    expect(needsSystemBrowser('google_pay')).toBe(true);
    expect(needsSystemBrowser('apple_pay')).toBe(false);
  });

  it('retour du widget : seulement NOTRE page, identifiant valide', () => {
    const base = 'https://kalyxwallet.com/buy/complete';
    expect(parseBuyRedirect(`${base}?transactionId=45751523-c3e2-47a5-ad0f-e5cb89e94037&transactionStatus=pending`, base)).toEqual({
      transactionId: '45751523-c3e2-47a5-ad0f-e5cb89e94037',
      status: 'pending',
    });
    expect(parseBuyRedirect('https://evil.com/buy/complete?transactionId=45751523-c3e2', base)).toBeNull();
    expect(parseBuyRedirect(`${base}?transactionId=<x>`, base)).toBeNull();
    expect(parseBuyRedirect('http://kalyxwallet.com/buy/complete?transactionId=45751523-c3e2', base)).toBeNull();
    expect(buyTrackerUrl('sandbox', 'abc-123')).toBe('https://buy-sandbox.moonpay.com/transaction_receipt?transactionId=abc-123');
    expect(isMoonpayHost('buy-sandbox.moonpay.com')).toBe(true);
    expect(isMoonpayHost('moonpay.com.evil.io')).toBe(false);
  });
});

import { buyProgress, groupBuyTokens, networkFeeTier, isStablecoin } from './moonpay';

describe('parcours d’achat', () => {
  it('un token, ses réseaux — Ethereum en premier', () => {
    const g = groupBuyTokens([
      { code: 'usdc_base', symbol: 'USDC', name: 'USD Coin (Base)', chainId: 'base', contract: '0x1' },
      { code: 'eth', symbol: 'ETH', name: 'Ethereum', chainId: 'ethereum', contract: null },
      { code: 'usdc', symbol: 'USDC', name: 'USD Coin', chainId: 'ethereum', contract: '0x2' },
    ]);
    expect(g.map((x) => x.symbol)).toEqual(['USDC', 'ETH']);
    expect(g[0].name).toBe('USD Coin');
    expect(g[0].networks.map((n) => n.chainId)).toEqual(['ethereum', 'base']);
    expect(networkFeeTier('ethereum')).toBe('high');
    expect(networkFeeTier('base')).toBe('low');
    expect(isStablecoin('usdc')).toBe(true);
  });

  it('progression depuis le statut seul', () => {
    expect(buyProgress({ status: 'waitingPayment' })).toEqual({ steps: ['active', 'todo', 'todo', 'todo'], outcome: 'pending' });
    expect(buyProgress({ status: 'pending' }).steps).toEqual(['done', 'active', 'todo', 'todo']);
    expect(buyProgress({ status: 'completed' })).toEqual({ steps: ['done', 'done', 'done', 'done'], outcome: 'completed' });
    expect(buyProgress({ status: 'failed' }).steps[0]).toBe('failed');
  });

  it('progression depuis les étapes MoonPay', () => {
    const S = (a: string, b: string, c: string, d: string) => [
      { stage: 'stage_one_ordering', status: a },
      { stage: 'stage_two_verification', status: b },
      { stage: 'stage_three_processing', status: c },
      { stage: 'stage_four_delivery', status: d },
    ];
    expect(buyProgress({ status: 'pending', stages: S('success', 'success', 'in_progress', 'not_started') }).steps).toEqual(['done', 'active', 'todo', 'todo']);
    expect(buyProgress({ status: 'pending', stages: S('success', 'success', 'success', 'not_started') }).steps).toEqual(['done', 'done', 'active', 'todo']);
    expect(buyProgress({ status: 'completed', stages: S('success', 'success', 'success', 'success') }).steps).toEqual(['done', 'done', 'done', 'done']);
    expect(buyProgress({ status: 'failed', stages: S('success', 'failed', 'not_started', 'not_started') })).toEqual({ steps: ['failed', 'todo', 'todo', 'todo'], outcome: 'failed' });
    expect(buyProgress({ status: 'failed', stages: S('success', 'success', 'success', 'not_started') }).steps).toEqual(['done', 'done', 'failed', 'todo']);
  });
});

describe('rampWalletAddress — Bitcoin de test en mode test', () => {
  // Vecteurs BIP173 : même programme témoin, préfixe bc → tb.
  const BC = 'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4';
  const TB = 'tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx';

  it('convertit une adresse segwit v0 (bc1q → tb1q, même programme)', () => {
    expect(btcToTestnet(BC)).toBe(TB);
  });

  it('convertit une adresse taproot (bech32m) en gardant son programme', () => {
    const main = 'bc1p0xlxvlhemja6c4dqv22uapctqupfhlxm9h8z3k2e72q4k9hcz7vqzk5jj0';
    const test = btcToTestnet(main)!;
    expect(test.startsWith('tb1p')).toBe(true);
    expect(bech32m.decode(test as `${string}1${string}`).words).toEqual(bech32m.decode(main as `${string}1${string}`).words);
  });

  it('convertit les adresses historiques (1… → m/n…, 3… → 2…) en gardant le hash', () => {
    const p2pkh = btcToTestnet('1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2')!;
    expect(/^[mn]/.test(p2pkh)).toBe(true);
    const a = base58check(sha256).decode('1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2');
    const b = base58check(sha256).decode(p2pkh);
    expect(b[0]).toBe(0x6f);
    expect(Array.from(b.slice(1))).toEqual(Array.from(a.slice(1)));
    expect(btcToTestnet('3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy')!.startsWith('2')).toBe(true);
  });

  it('ne touche à rien en mode réel, ni aux autres réseaux', () => {
    expect(rampWalletAddress('bitcoin', BC, { sandbox: false })).toBe(BC);
    expect(rampWalletAddress('ethereum', '0xabc', { sandbox: true })).toBe('0xabc');
    expect(rampWalletAddress('bitcoin', BC, { sandbox: true })).toBe(TB);
  });

  it('laisse une adresse illisible telle quelle plutôt que d’inventer', () => {
    expect(btcToTestnet('pas-une-adresse')).toBeNull();
    expect(rampWalletAddress('bitcoin', 'pas-une-adresse', { sandbox: true })).toBe('pas-une-adresse');
  });
});
