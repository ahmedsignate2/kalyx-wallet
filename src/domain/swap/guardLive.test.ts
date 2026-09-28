import { getSwapQuote } from './lifi';
import { checkSwapQuote } from './guard';
const EVM = '0x552008c0f6870c2f77e5cC1d2eb9bdff03e30Ea0';
const SOL = '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU';
const N = '0x0000000000000000000000000000000000000000';
const S = '11111111111111111111111111111111';
const cases: [string, number, string, string, bigint, string][] = [
  ['ETH→rETH', 1, N, '0xae78736cd615f374d3085123a210448e74fc6393', 10n ** 16n, EVM],
  ['rETH→ETH', 1, '0xae78736cd615f374d3085123a210448e74fc6393', N, 10n ** 16n, EVM],
  ['stETH→ETH', 1, '0xae7ab96520de3a18e5e111b5eaab095312d7fe84', N, 10n ** 16n, EVM],
  ['sAVAX→AVAX', 43114, '0x2b2c81e08f1af8835a78bb2a90ae924ace0ea4be', N, 10n ** 18n, EVM],
  ['SOL→JitoSOL', 1151111081099710, S, 'J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn', 10n ** 8n, SOL],
  ['mSOL→SOL', 1151111081099710, 'mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So', S, 10n ** 8n, SOL],
];
(process.env.EARN_LIVE === '1' ? describe : describe.skip)('guard LIVE (Earn)', () => {
  for (const [name, chain, from, to, amt, addr] of cases) {
    it(name, async () => {
      const q = await getSwapQuote({ fromChainId: chain, toChainId: chain, fromToken: from, toToken: to, fromAmount: amt, fromAddress: addr, isEarn: true } as never);
      expect(q).not.toBeNull();
      expect(checkSwapQuote(q!, { fromEvmChainId: chain === 1151111081099710 ? undefined : chain, fromToken: from, fromAmount: amt, fromAddress: addr, toAddress: addr })).toEqual({ ok: true });
    }, 30000);
  }
});
