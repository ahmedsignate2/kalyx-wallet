/** LIVE : EARN_LIVE=1 npx jest gasReserve.live — estimation réelle sur plusieurs réseaux. */
import { estimateGasReserve } from './gasReserve';
import { getAdapter } from './registry';
import { formatBalance } from '../validation/amount';

const d = process.env.EARN_LIVE === '1' ? describe : describe.skip;
d('réserve de gas LIVE', () => {
  jest.setTimeout(60_000);
  it.each(['ethereum', 'base', 'arbitrum', 'polygon', 'bnb', 'avalanche', 'solana'])('%s', async (id) => {
    const a = getAdapter(id);
    const r = await estimateGasReserve(a);
    console.log(id.padEnd(10), r.live ? 'LIVE' : 'FALLBACK', formatBalance(r.raw, a.config.nativeDecimals, 8), a.config.nativeSymbol);
    expect(r.raw).toBeGreaterThan(0n);
    expect(r.live).toBe(true);
  });
});
