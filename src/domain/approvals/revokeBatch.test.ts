import { runRevokeBatch } from './approvals';

const err = (code: string) => Object.assign(new Error(code), { code });
const sendOk = (log: number[]) => async (_x: string, n: number) => {
  log.push(n);
  return { hash: '0x', nonce: n };
};

describe('runRevokeBatch', () => {
  it('nonces consécutifs ; le nonce réseau plus grand est suivi', async () => {
    const log: number[] = [];
    const r = await runRevokeBatch(['a', 'b', 'c'], 7, {
      send: async (x, n) => {
        const used = x === 'b' ? n + 2 : n; // une autre transaction est partie entre-temps
        log.push(used);
        return { hash: x, nonce: used };
      },
    });
    expect(log).toEqual([7, 10, 11]);
    expect(r.map((x) => x.status)).toEqual(['sent', 'sent', 'sent']);
  });
  it('déjà à 0 : rien n’est envoyé ; refus du contrat : nonce réutilisé', async () => {
    const log: number[] = [];
    const r = await runRevokeBatch(['a', 'b', 'c', 'd'], 0, {
      check: async (x) => (x === 'a' ? 'revoked' : 'active'),
      send: async (x, n) => {
        log.push(n);
        if (x === 'b') throw err('CALL_EXCEPTION');
        return { hash: x, nonce: n };
      },
    });
    expect(log).toEqual([0, 0, 1]);
    expect(r.map((x) => x.status)).toEqual(['already', 'skipped', 'sent', 'sent']);
  });
  it('frais insuffisants : arrêt ; erreur de diffusion : incertaine, arrêt', async () => {
    const r = await runRevokeBatch(['a', 'b', 'c'], 0, { send: async (x, n) => { if (x === 'b') throw err('INSUFFICIENT_FUNDS'); return { hash: x, nonce: n }; } });
    expect(r.map((x) => x.status)).toEqual(['sent', 'failed', 'notSent']);
    // Échec avant signature (RPC muet) : rien n'est parti → « failed », pas « incertaine ».
    const r2 = await runRevokeBatch(['a', 'b'], 0, { send: async () => { throw new Error('timeout'); } });
    expect(r2.map((x) => x.status)).toEqual(['failed', 'notSent']);
    // Échec PENDANT la diffusion : incertaine.
    const r3 = await runRevokeBatch(['a'], 0, { send: async () => { throw Object.assign(new Error('reset'), { afterSign: true }); } });
    expect(r3.map((x) => x.status)).toEqual(['uncertain']);
  });
  it('demande annulée : plus rien ne part', async () => {
    const log: number[] = [];
    let go = true;
    const r = await runRevokeBatch(['a', 'b'], 0, { send: async (x, n) => { log.push(n); go = false; return { hash: x, nonce: n }; }, shouldContinue: () => go });
    expect(log).toEqual([0]);
    expect(r.map((x) => x.status)).toEqual(['sent', 'notSent']);
  });
});
