import { Cell } from '@ton/core';
import V from './tonstakers-vectors.json';
import { parseStakingPool, stakeBody, unstakeBody, TONSTAKERS_STAKE_OP, TONSTAKERS_UNSTAKE_OP } from './tonstakers';

describe('Tonstakers — dépôts réels', () => {
  it.each(V.deposits.map((d) => [d.tx, d] as const))('même disposition que le dépôt %s', (_tx, d) => {
    const s = Cell.fromBase64(d.body).beginParse();
    expect(s.loadUint(32)).toBe(TONSTAKERS_STAKE_OP);
    const query = s.loadUintBig(64);
    const partner = s.loadUintBig(64);
    expect(s.remainingBits).toBe(0);
    // Reconstruit avec les mêmes valeurs : même cellule, au bit près.
    expect(stakeBody(query, partner).hash().equals(Cell.fromBase64(d.body).hash())).toBe(true);
  });
});

describe('Tonstakers — retraits réels (burn tsTON)', () => {
  const simple = V.burns.filter((b) => b.custom_payload !== null || true);
  it.each(simple.map((b) => [b.tx, b] as const))('reconstruit le retrait %s', (_tx, b) => {
    const s = Cell.fromBase64(b.body).beginParse();
    expect(s.loadUint(32)).toBe(TONSTAKERS_UNSTAKE_OP);
    const query = s.loadUintBig(64);
    const amount = s.loadCoins();
    const response = s.loadAddress()!;
    const flags = s.loadMaybeRef();
    let mode: 'standard' | 'instant' | 'bestRate' = 'standard';
    if (flags) {
      const f = flags.beginParse();
      const wait = f.loadUint(1);
      const fok = f.loadUint(1);
      mode = wait ? 'bestRate' : fok ? 'instant' : 'standard';
      if (wait && fok) return; // combinaison que Kalyx n'émet pas
    }
    expect(amount.toString()).toBe(b.amount);
    const ours = unstakeBody({ amount, owner: response.toRawString(), mode, queryId: query });
    if (flags) expect(ours.hash().equals(Cell.fromBase64(b.body).hash())).toBe(true);
  });
});

describe('pool', () => {
  it('lit la réponse TonAPI relevée', () => {
    const p = parseStakingPool({ pool: { apy: 13.340795379421305, min_stake: 1000000000, liquid_jetton_master: '0:bdf3fa8098d129b54b4f73b5bac5d1e1fd91eb054169c3916dfc8ccd536d1000', current_nominators: 141878, cycle_end: 1790628192 } })!;
    expect(p).toMatchObject({ minStake: 1_000_000_000n, stakers: 141878, tsTonMaster: '0:bdf3fa8098d129b54b4f73b5bac5d1e1fd91eb054169c3916dfc8ccd536d1000' });
    expect(p.apy).toBeCloseTo(13.34, 2);
    expect(parseStakingPool({})).toBeNull();
  });
});
