import { runRevokeBatch } from './approvals';

const err = (code: string) => Object.assign(new Error(code), { code });

describe('runRevokeBatch', () => {
  it('nonces consécutifs, une par autorisation', async () => {
    const nonces: number[] = [];
    const r = await runRevokeBatch(['a', 'b', 'c'], 7, async (x, n) => { nonces.push(n); return `0x${x}`; });
    expect(nonces).toEqual([7, 8, 9]);
    expect(r.map((x) => x.status)).toEqual(['sent', 'sent', 'sent']);
  });
  it('refus avant diffusion : passée, nonce réutilisé pour la suivante', async () => {
    const nonces: number[] = [];
    const r = await runRevokeBatch(['a', 'b', 'c'], 0, async (x, n) => {
      nonces.push(n);
      if (x === 'b') throw err('CALL_EXCEPTION');
      return x;
    });
    expect(nonces).toEqual([0, 1, 1]);
    expect(r.map((x) => x.status)).toEqual(['sent', 'skipped', 'sent']);
  });
  it('frais insuffisants ou diffusion incertaine : arrêt, le reste non envoyé', async () => {
    const r = await runRevokeBatch(['a', 'b', 'c'], 0, async (x) => {
      if (x === 'b') throw err('INSUFFICIENT_FUNDS');
      return x;
    });
    expect(r.map((x) => x.status)).toEqual(['sent', 'failed', 'notSent']);
    const r2 = await runRevokeBatch(['a', 'b'], 0, async () => { throw new Error('timeout'); });
    expect(r2.map((x) => x.status)).toEqual(['failed', 'notSent']);
  });
});
