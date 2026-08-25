import { parseSwapQuote, NOVA_FEE, NOVA_INTEGRATOR } from './lifi';

describe('parseSwapQuote', () => {
  const json = {
    action: {
      fromToken: { address: '0x0000000000000000000000000000000000000000', symbol: 'eth', decimals: 18 },
      toToken: { address: '0xA0b8...', symbol: 'usdc', decimals: 6, logoURI: 'http://l' },
    },
    estimate: {
      fromAmount: '1000000000000000000',
      toAmount: '3450000000',
      toAmountMin: '3400000000',
      approvalAddress: '',
      executionDuration: 30,
      fromAmountUSD: '3450',
      toAmountUSD: '3440',
      gasCosts: [{ amountUSD: '2.5', amount: '120000000000000', token: { symbol: 'eth', decimals: 18 } }],
      feeCosts: [{ amountUSD: '10.3' }],
    },
    transactionRequest: {
      to: '0xRouter',
      data: '0xabcdef',
      value: '1000000000000000000',
      chainId: 1,
      gasLimit: '250000',
      gasPrice: '30000000000',
    },
    toolDetails: { name: '1inch' },
  };

  it('extrait montants, tokens, tx et outil', () => {
    const q = parseSwapQuote(json)!;
    expect(q.fromAmount).toBe(10n ** 18n);
    expect(q.toAmount).toBe(3450000000n);
    expect(q.toAmountMin).toBe(3400000000n);
    expect(q.fromToken.symbol).toBe('ETH');
    expect(q.toToken).toMatchObject({ symbol: 'USDC', decimals: 6 });
    expect(q.approvalAddress).toBeNull(); // natif -> pas d'approbation
    expect(q.tx).toMatchObject({ to: '0xRouter', data: '0xabcdef', chainId: 1 });
    const tx = q.tx as any;
    expect(tx.value).toBe(10n ** 18n);
    expect(tx.gasLimit).toBe(250000n);
    expect(q.toolName).toBe('1inch');
  });

  it('extrait les détails avancés (gas, frais, durée, valeurs USD)', () => {
    const q = parseSwapQuote(json)!;
    expect(q.gasCostUsd).toBeCloseTo(2.5);
    expect(q.gasCostNative).toBe(120000000000000n);
    expect(q.gasToken?.symbol).toBe('ETH');
    expect(q.feeCostUsd).toBeCloseTo(10.3);
    expect(q.durationSec).toBe(30);
    expect(q.fromAmountUsd).toBe(3450);
    expect(q.toAmountUsd).toBe(3440);
  });

  it('renseigne approvalAddress pour un ERC-20', () => {
    const q = parseSwapQuote({ ...json, estimate: { ...json.estimate, approvalAddress: '0xSpender' } })!;
    expect(q.approvalAddress).toBe('0xSpender');
  });

  it('renvoie null si transactionRequest incomplet', () => {
    expect(parseSwapQuote({ estimate: json.estimate })).toBeNull();
    expect(parseSwapQuote(null)).toBeNull();
  });

  it('constantes de frais intégrateur', () => {
    expect(NOVA_INTEGRATOR).toBe('nova');
    expect(NOVA_FEE).toBe('0.003'); // 0,3 %
  });
});
