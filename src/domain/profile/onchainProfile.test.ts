import { badgesOf, firstTransferBody, parseFirstTransfer, parseSolanaSignatures, summarize } from './onchainProfile';
import { parseTrendingIds, inTrendingOrder, type MarketCoin } from '../prices/coingecko';

const NOW = Date.parse('2026-10-18T00:00:00Z');
const DAY = 86_400_000;

describe('profil on-chain', () => {
  it('résumé : réseaux actifs, total, plus ancienne date ; les réseaux vides ne comptent pas', () => {
    const p = summarize(
      [
        { chainId: 'ethereum', txCount: 40, firstAt: NOW - 800 * DAY },
        { chainId: 'base', txCount: 70, firstAt: NOW - 100 * DAY },
        { chainId: 'polygon', txCount: 0 },
        { chainId: 'solana', txCount: 1000, atLeast: true },
      ],
      ['bitcoin'],
    );
    expect(p.chains.map((c) => c.chainId)).toEqual(['ethereum', 'base', 'solana']);
    expect(p.totalTx).toBe(1110);
    expect(p.atLeast).toBe(true);
    expect(p.firstAt).toBe(NOW - 800 * DAY);
    expect(p.failed).toEqual(['bitcoin']);
    expect(badgesOf(p, NOW).filter((b) => b.earned).map((b) => b.id)).toEqual(['veteran', 'multichain', 'regular']);
  });

  it('sans date connue : pas de badge Vétéran (jamais deviné)', () => {
    const p = summarize([{ chainId: 'bitcoin', txCount: 3 }], []);
    expect(p.firstAt).toBeUndefined();
    expect(badgesOf(p, NOW)).toEqual([
      { id: 'veteran', earned: false },
      { id: 'multichain', earned: false },
      { id: 'regular', earned: false },
      { id: 'bitcoiner', earned: true },
    ]);
  });

  it('premier transfert Alchemy : date lue, requête en ordre croissant limitée à 1', () => {
    expect(parseFirstTransfer({ result: { transfers: [{ metadata: { blockTimestamp: '2021-05-04T10:00:00.000Z' } }] } })).toBe(Date.parse('2021-05-04T10:00:00.000Z'));
    expect(parseFirstTransfer({ result: { transfers: [] } })).toBeUndefined();
    expect(parseFirstTransfer({ error: { message: 'x' } })).toBeUndefined();
    const body = JSON.parse(firstTransferBody('0xabc', 'to', ['external']));
    expect(body.params[0]).toMatchObject({ toAddress: '0xabc', order: 'asc', maxCount: '0x1', withMetadata: true });
  });

  it('Solana : date seulement si tout l’historique a été lu', () => {
    expect(parseSolanaSignatures([{ blockTime: 1_700_000_000 }, { blockTime: 1_600_000_000 }], 1000)).toEqual({ txCount: 2, firstAt: 1_600_000_000_000 });
    const full = Array.from({ length: 3 }, (_, i) => ({ blockTime: 1_700_000_000 - i }));
    expect(parseSolanaSignatures(full, 3)).toEqual({ txCount: 3, atLeast: true });
    expect(() => parseSolanaSignatures({ error: 1 }, 1000)).toThrow();
  });
});

describe('tendances CoinGecko', () => {
  it('ids dans l’ordre, sans doublon ni valeur suspecte', () => {
    expect(parseTrendingIds({ coins: [{ item: { id: 'pepe' } }, { item: { id: 'bitcoin' } }, { item: { id: 'pepe' } }, { item: { id: '<script>' } }, {}] })).toEqual(['pepe', 'bitcoin']);
    expect(parseTrendingIds(null)).toEqual([]);
  });

  it('cotations remises dans l’ordre des tendances', () => {
    const c = (id: string) => ({ id }) as MarketCoin;
    expect(inTrendingOrder([c('bitcoin'), c('pepe'), c('other')], ['pepe', 'bitcoin']).map((x) => x.id)).toEqual(['pepe', 'bitcoin']);
  });
});
