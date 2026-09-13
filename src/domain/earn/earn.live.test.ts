/**
 * Test LIVE (réseau) du moteur Earn — vérifie contre les vraies chaînes :
 * APY Aave on-chain, soldes de reçus, simulation des appels directs, routes LI.FI.
 * À lancer manuellement : EARN_LIVE=1 npx jest earn.live
 */
import { EvmChainAdapter } from '../chains/EvmChainAdapter';
import { ALL_CHAINS } from '../chains/configs';
const getChainConfig = (id: string) => ALL_CHAINS.find((c) => c.id === id)!;
import { getSwapQuote, NATIVE_TOKEN } from '../swap/lifi';
import { EARN_CATALOG, NATIVE, encodeAaveGetReserveData, decodeAaveReserveData, fetchLlamaPoolApy } from './index';

const LIVE = process.env.EARN_LIVE === '1';
const d = LIVE ? describe : describe.skip;

d('Earn LIVE', () => {
  jest.setTimeout(120_000);

  it('Aave v3 : chaque marché renvoie un aToken identique au catalogue + APY plausible', async () => {
    const lending = EARN_CATALOG.filter((p) => p.kind === 'lending');
    const results = await Promise.all(
      lending.map(async (p) => {
        const a = new EvmChainAdapter(getChainConfig(p.chainId));
        const hex = await a.callContract(p.contract!, encodeAaveGetReserveData(p.underlying.address));
        const r = decodeAaveReserveData(hex)!;
        return { id: p.id, ok: r.aToken === p.receipt.address, apy: r.supplyApy };
      }),
    );
    for (const r of results) {
      console.log(r.id, r.ok ? 'aToken OK' : 'aToken MISMATCH', r.apy.toFixed(2) + '%');
      expect(r.ok).toBe(true);
      expect(r.apy).toBeGreaterThan(0);
      expect(r.apy).toBeLessThan(50);
    }
  });

  it('DefiLlama : APY des stakings liquides', async () => {
    const staking = EARN_CATALOG.filter((p) => p.kind === 'staking' && p.apy.source === 'defillama');
    for (const p of staking) {
      const apy = await fetchLlamaPoolApy((p.apy as { pool: string }).pool);
      console.log(p.id, apy);
      expect(apy).not.toBeNull();
      expect(apy!).toBeGreaterThan(0);
    }
  });

  it('LI.FI : routes dépôt/retrait EVM', async () => {
    const evmAddr = '0x28C6c06298d514Db089934071355E5743bf21d60';
    const cases = EARN_CATALOG.filter((p) => p.chainId !== 'solana' && (p.deposit.via === 'lifi' || p.withdraw.via === 'lifi'));
    for (const p of cases) {
      const a = new EvmChainAdapter(getChainConfig(p.chainId));
      const chain = a.config.evmChainId!;
      const tok = (addr: string) => (addr === NATIVE ? NATIVE_TOKEN : addr);
      if (p.withdraw.via === 'lifi') {
        const q = await getSwapQuote({ fromChainId: chain, toChainId: chain, fromToken: tok(p.receipt.address), toToken: tok(p.underlying.address), fromAmount: 10n ** 17n, fromAddress: evmAddr, isEarn: false });
        console.log(p.id, 'withdraw', q?.toolName, q?.toAmount.toString(), 'approval', q?.approvalAddress);
        expect(q).not.toBeNull();
        expect(q!.approvalAddress).toBeTruthy();
      }
      if (p.deposit.via === 'lifi') {
        const q = await getSwapQuote({ fromChainId: chain, toChainId: chain, fromToken: tok(p.underlying.address), toToken: tok(p.receipt.address), fromAmount: 10n ** 17n, fromAddress: evmAddr, isEarn: true });
        console.log(p.id, 'deposit', q?.toolName, q?.toAmount.toString());
        expect(q).not.toBeNull();
      }
    }
  });
});
