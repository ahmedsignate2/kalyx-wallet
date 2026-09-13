import { humanizeTx, groupByDay } from './humanize';
import type { TxSummary } from '../chains/types';

const ME = '0x28C6c06298d514Db089934071355E5743bf21d60';
const V = '0xd8dA6BF26964aF9D7eEd9e03E62415f8b1F2f8F7';
const ctx = { nativeSymbol: 'ETH', nativeDecimals: 18, nameOf: (a: string) => (a === V ? 'vitalik.eth' : undefined) };
const base: TxSummary = { hash: '0x1', from: ME, to: V, value: 10n ** 17n, timestamp: 1_700_000_000, direction: 'out', status: 'success' };

describe('humanizeTx', () => {
  it('envoi natif avec nom', () => {
    const h = humanizeTx(base, ctx);
    expect(h.title).toBe('Envoyé 0.1 ETH');
    expect(h.subtitle).toBe('à vitalik.eth');
    expect(h.amount).toBe('−0.1 ETH');
    expect(h.tone).toBe('down');
  });
  it('réception token', () => {
    const h = humanizeTx({ ...base, from: V, to: ME, direction: 'in', asset: 'USDC', decimals: 6, value: 50_000_000n }, ctx);
    expect(h.title).toBe('Reçu 50 USDC');
    expect(h.subtitle).toBe('de vitalik.eth');
    expect(h.tone).toBe('up');
    expect(h.spam).toBe(false);
  });
  it('token entrant NON vérifié = spam, gris, sans +, sans valeur', () => {
    const h = humanizeTx({ ...base, direction: 'in', from: '0xabc', to: ME, asset: 'PPOLY', decimals: 18, value: 9n * 10n ** 18n }, { ...ctx, verifiedSymbols: new Set(['ETH', 'USDC']), fiatOf: () => '1,00 €' });
    expect(h.spam).toBe(true);
    expect(h.tone).toBe('neutral');
    expect(h.amount).toBe('9 PPOLY');
    expect(h.fiat).toBeUndefined();
  });
  it('contrepartie + fiat sur un envoi', () => {
    const h = humanizeTx(base, { ...ctx, fiatOf: (s, a) => `${(a * 2000).toFixed(2)} €` });
    expect(h.counterparty).toBe(V);
    expect(h.fiat).toBe('200.00 €');
  });
  it('poussière entrante = spam masqué', () => {
    expect(humanizeTx({ ...base, direction: 'in', value: 0n, from: '0xabc', to: ME }, ctx).spam).toBe(true);
  });
  it('approbation, swap, NFT', () => {
    expect(humanizeTx({ ...base, type: 'APPROVE', asset: 'USDC', value: 0n }, ctx).title).toBe('Autorisé vitalik.eth à dépenser tes USDC');
    expect(humanizeTx({ ...base, type: 'SWAP' }, ctx).title).toBe('Échangé 0.1 ETH');
    expect(humanizeTx({ ...base, type: 'NFT', direction: 'in', from: V, to: ME }, ctx).title).toBe('Reçu 1 NFT de vitalik.eth');
  });
  it('échec expliqué', () => {
    const h = humanizeTx({ ...base, status: 'failed' }, ctx);
    expect(h.title).toBe('Échouée · envoyé 0.1 ETH');
    expect(h.tone).toBe('danger');
    expect(h.subtitle).toContain('Rien n’a été débité');
  });
  it('groupe par jour', () => {
    const now = Date.UTC(2026, 8, 11, 12);
    const day = 86_400;
    const t = Math.floor(now / 1000);
    const g = groupByDay([{ timestamp: t - 3 * day }, { timestamp: t - 100 }, { timestamp: t - day }, { timestamp: t - 200 }], now);
    expect(g.map((x) => x.label)).toEqual(['Aujourd’hui', 'Hier', expect.any(String)]);
    expect(g[0].items).toHaveLength(2);
    expect(g[0].items[0].timestamp).toBe(t - 100);
  });
});
