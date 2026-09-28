/** Test LIVE (réseau) : EARN_LIVE=1 npx jest stonfiLive */
import { getStonfiQuote, tonSwapPaysUser } from './stonfi';
import { checkSwapQuote } from './guard';

const USER = 'UQC020bHeiUqqyw8BB4EttblmRidKkT_hnINJ-8rZCP0L1Dw';
const USDT = '0:b113a994b5024a16719f69139328eb759596c38a25f59028b146fecdc3621dfe';
(process.env.EARN_LIVE === '1' ? describe : describe.skip)('STON.fi LIVE', () => {
  it('TON → USDT : devis v2 accepté, message qui paie l’utilisateur', async () => {
    const q = await getStonfiQuote({ fromToken: 'ton', toToken: USDT, fromAmount: 1_000_000_000n, fromAddress: USER });
    expect(q?.tx.type).toBe('ton');
    if (q?.tx.type !== 'ton') return;
    expect(q.toAmountMin).toBeGreaterThan(0n);
    expect(tonSwapPaysUser(q.tx.messages[0], USER, q.tx.router)).toBe(true);
    expect(checkSwapQuote(q, { fromToken: 'ton', fromAmount: 1_000_000_000n, fromAddress: USER, toAddress: USER })).toEqual({ ok: true });
  }, 30000);
});
