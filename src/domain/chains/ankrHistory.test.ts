import LIVE from './ankr-base-live.json';
import { parseAnkrHistory, ankrTime } from './ankr';
import { spamReason, knownCounterparties, type SpamCtx } from '../tx/spam';
import { knownTokensFor } from '../tokens/knownTokens';

const txs = parseAnkrHistory(LIVE.transactions, LIVE.tokenTransfers, LIVE.address).map((t) => ({ ...t, chain: 'base' }));
const base = new Set(knownTokensFor(8453).map((a) => a.toLowerCase()));
const trusted: SpamCtx['trusted'] = (_c, a) => base.has(a.toLowerCase());
const ctx: SpamCtx = { trusted, known: knownCounterparties(txs, trusted, [LIVE.address]) };
const shown = txs.filter((t) => !spamReason(t, ctx));
const hidden = txs.filter((t) => spamReason(t, ctx));

describe('Historique Base réel (Ankr)', () => {
  it('horodatage hexadécimal lu, pas remplacé par « maintenant »', () => {
    expect(ankrTime('0x6ab7d8df')).toBe(0x6ab7d8df);
    expect(txs.every((t) => t.timestamp > 1_700_000_000 && t.timestamp < 1_800_000_000)).toBe(true);
    expect(txs.map((t) => t.timestamp)).toEqual([...txs.map((t) => t.timestamp)].sort((a, b) => b - a));
  });

  it('les airdrops sont masqués (BOAR, BEAM, WESTERN GOLD RESERVE, TRUMP…)', () => {
    const hiddenSymbols = new Set(hidden.map((t) => t.asset));
    for (const s of ['BOAR', 'BEAM', 'WESTERN GOLD RESERVE', 'TRUMP', 'LILPEPE', 'Basecat']) expect(hiddenSymbols).toContain(s);
    expect(shown.some((t) => ['BOAR', 'BEAM', 'TRUMP'].includes(t.asset ?? ''))).toBe(false);
  });

  it('les faux envois « EṬH » / « UṢDC » vers des sosies sont masqués (empoisonnement)', () => {
    // Point souscrit COMBINANT (U+0323), comme dans la vraie réponse — pas la lettre précomposée.
    const fakes = txs.filter((t) => /[^\x20-\x7e]/.test(t.asset ?? ''));
    expect(fakes.map((t) => t.asset!.normalize('NFKD').replace(/[\u0300-\u036f]/g, ''))).toEqual(expect.arrayContaining(['ETH', 'USDC']));
    expect(fakes.length).toBeGreaterThan(0);
    // Chacun vise un SOSIE d'un vrai destinataire, au même montant : empoisonnement d'adresse.
    for (const f of fakes) expect(spamReason(f, ctx)).toBe('poisoning');
    const twin = fakes.find((f) => f.to.toLowerCase().startsWith('0x4999066c'));
    expect(twin).toBeDefined();
    expect(txs.some((t) => t.to.toLowerCase().startsWith('0x4999ba7f') && t.value === twin!.value && !t.contract)).toBe(true);
  });

  it('les vrais mouvements d’USDC et d’ETH restent visibles', () => {
    expect(shown.some((t) => t.asset === 'USDC' && t.direction === 'out')).toBe(true);
    expect(shown.some((t) => !t.contract && t.direction === 'out' && t.value > 0n)).toBe(true);
    expect(shown.length).toBeGreaterThan(10);
  });

  it('ETH → USDC via LI.FI = un échange', () => {
    const swap = txs.find((t) => t.hash.startsWith('0x234d0a42'));
    expect(swap).toMatchObject({ type: 'SWAP', direction: 'out', byOwner: true });
    expect(swap!.legs?.some((l) => l.direction === 'in' && l.asset === 'USDC')).toBe(true);
  });
});
