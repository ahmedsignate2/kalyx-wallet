import { amountProblem, buyableAssets, buyTrackerUrl, isMoonpayHost, needsSystemBrowser, parseBuyRedirect, paymentMethodsFor, pickFiat, type RampCurrency } from './moonpay';

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
    expect(list.map((a) => `${a.symbol}@${a.chainId}`)).toEqual(['ETH@ethereum', 'BTC@bitcoin', 'USDC@base']);
    expect(list[2].contract).toMatch(/^0x8335/);
    expect(list[0].contract).toBeNull();
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
