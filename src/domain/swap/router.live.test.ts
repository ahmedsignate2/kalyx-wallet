/** Test LIVE du routeur swap/bridge : EARN_LIVE=1 npx jest router.live */
import { getBestQuote } from './index';
import { SwapError } from './swapError';

const LIVE = process.env.EARN_LIVE === '1';
const d = LIVE ? describe : describe.skip;
const EVM = '0x28C6c06298d514Db089934071355E5743bf21d60';
const SOL = '5tzFkiKscXHK5ZXCGbXZxdw7gTjjD1mBwuoFbhUvuAi9';
const Z = '0x0000000000000000000000000000000000000000';

d('Router LIVE', () => {
  jest.setTimeout(120_000);
  const cases: [string, Parameters<typeof getBestQuote>[0]][] = [
    ['ETH → USDC (Ethereum)', { fromChainId: 'ethereum', toChainId: 'ethereum', fromToken: Z, toToken: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48', fromAmount: '100000000000000000', fromAddress: EVM, toAddress: EVM, slippage: 0.005 }],
    ['SOL → USDC (Solana, LI.FI + Jupiter)', { fromChainId: 'solana', toChainId: 'solana', fromToken: Z, toToken: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', fromAmount: '100000000', fromAddress: SOL, toAddress: SOL, slippage: 0.005, fromTokenInfo: { symbol: 'SOL', decimals: 9 }, toTokenInfo: { symbol: 'USDC', decimals: 6 } }],
    ['ETH (Base) → SOL (bridge cross-VM)', { fromChainId: 'base', toChainId: 'solana', fromToken: Z, toToken: Z, fromAmount: '10000000000000000', fromAddress: EVM, toAddress: SOL, slippage: 0.01 }],
    ['SOL → ETH (Base) (bridge cross-VM)', { fromChainId: 'solana', toChainId: 'base', fromToken: Z, toToken: Z, fromAmount: '100000000', fromAddress: SOL, toAddress: EVM, slippage: 0.01 }],
    ['USDC (Base) → ETH (Arbitrum)', { fromChainId: 'base', toChainId: 'arbitrum', fromToken: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913', toToken: Z, fromAmount: '10000000', fromAddress: EVM, toAddress: EVM }],
  ];
  for (const [name, p] of cases) {
    it(name, async () => {
      const q = await getBestQuote(p);
      expect(q).not.toBeNull();
      console.log(name, '→', q!.toolName, 'out=', q!.toAmount.toString(), q!.toToken.symbol, 'dec=', q!.toToken.decimals, 'min=', q!.toAmountMin.toString(), 'gasUSD=', q!.gasCostUsd.toFixed(3));
      expect(q!.toAmount).toBeGreaterThan(0n);
      expect(q!.toToken.decimals).toBeGreaterThanOrEqual(0);
    });
  }

  it('erreur claire : montant trop faible (bridge)', async () => {
    try {
      await getBestQuote({ fromChainId: 'base', toChainId: 'solana', fromToken: Z, toToken: Z, fromAmount: '1000', fromAddress: EVM, toAddress: SOL });
      throw new Error('devait échouer');
    } catch (e) {
      expect(e).toBeInstanceOf(SwapError);
      console.log('too small →', (e as SwapError).code, (e as SwapError).meta);
      expect((e as SwapError).code).toBe('AMOUNT_BELOW_MINIMUM');
    }
  });
  it('erreur claire : token invalide', async () => {
    try {
      await getBestQuote({ fromChainId: 'ethereum', toChainId: 'ethereum', fromToken: Z, toToken: '0x1111111111111111111111111111111111111111', fromAmount: '100000000000000000', fromAddress: EVM, toAddress: EVM });
      throw new Error('devait échouer');
    } catch (e) {
      console.log('invalid token →', (e as SwapError).code);
      expect((e as SwapError).code).toBe('INVALID_TOKEN');
    }
  });
});
