import { TonCenterClient } from './tonCenter';

const reply = (status: number, body: unknown) => ({ status, text: async () => JSON.stringify(body) });

describe('TonCenterClient — reprises', () => {
  /* HTTP 429 : la requête n'a pas été traitée, la reprendre est sans risque. */
  it('reprend une lecture refusée pour débit (429)', async () => {
    let n = 0;
    const c = new TonCenterClient('https://toncenter.com/api', async () => (++n <= 2 ? reply(429, {}) : reply(200, { balance: '7', status: 'uninit', last_transaction_lt: '0' })), 0, async () => {});
    expect((await c.accountState('UQx')).balance).toBe(7n);
    expect(n).toBe(3);
  });

  /*
   * Une erreur RÉSEAU pendant une diffusion n'est PAS reprise : le message a pu
   * partir, et le rediffuser ferait lire son refus (seqno consommé) comme un
   * échec, alors que la transaction est passée.
   */
  it('ne rediffuse pas après une erreur réseau', async () => {
    let n = 0;
    const c = new TonCenterClient('https://toncenter.com/api', async () => { n++; throw new Error('socket hang up'); }, 0, async () => {});
    await expect(c.sendBoc('Qk9D')).rejects.toMatchObject({ code: 'RPC_UNAVAILABLE' });
    expect(n).toBe(1);
  });

  it('une lecture, elle, est reprise après une erreur réseau', async () => {
    let n = 0;
    const c = new TonCenterClient('https://toncenter.com/api', async () => (++n < 2 ? Promise.reject(new Error('reset')) : reply(200, { transactions: [] })), 0, async () => {});
    expect(await c.transactionsByMessage('ab')).toEqual([]);
    expect(n).toBe(2);
  });

  it('adresse illisible (422) : erreur d’adresse, pas de réseau', async () => {
    const c = new TonCenterClient('https://toncenter.com/api', async () => reply(422, { error: 'failed to decode' }), 0, async () => {});
    await expect(c.accountState('x')).rejects.toMatchObject({ code: 'INVALID_ADDRESS' });
  });
});
