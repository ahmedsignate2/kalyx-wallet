import { describe, expect, test } from 'vitest';
import { makeStore, type StorageArea } from './storage';
import { makeTxWatch, type TxOutcome, type Watched } from './txWatch';

function area(): StorageArea {
  const data: Record<string, unknown> = {};
  return {
    async get(keys) { return Object.fromEntries(keys.filter((k) => k in data).map((k) => [k, structuredClone(data[k])])); },
    async set(items) { Object.assign(data, structuredClone(items)); },
    async remove(keys) { for (const k of keys) delete data[k]; },
  };
}

describe('suivi des transactions', () => {
  test('une seule notification à l’issue, rien pendant l’attente ; alarme coupée quand plus rien à suivre', async () => {
    let clock = 1_000;
    const outcomes: Record<string, TxOutcome> = { a: 'pending', b: 'failed' };
    const notes: string[] = [];
    const sched: boolean[] = [];
    const w = makeTxWatch({ store: makeStore(area()), check: async (x) => outcomes[x.txid], notify: (o, x: Watched) => notes.push(`${o}:${x.txid}:${x.what}`), schedule: (on) => sched.push(on), now: () => clock });
    await w.add({ txid: 'a', chainId: 'ethereum', chainName: 'Ethereum', what: '0.1 ETH', explorer: 'https://etherscan.io/tx/a' });
    await w.add({ txid: 'b', chainId: 'base', chainName: 'Base', what: '5 USDC' });
    await w.tick();
    expect(notes).toEqual(['failed:b:5 USDC']);
    expect(await w.pending()).toBe(1);
    expect(await w.explorerOf('a')).toBe('https://etherscan.io/tx/a');
    outcomes.a = 'confirmed';
    await w.tick();
    expect(notes).toEqual(['failed:b:5 USDC', 'confirmed:a:0.1 ETH']);
    expect(sched.at(-1)).toBe(false);
  });

  test('réseau muet : la transaction reste suivie ; au-delà d’une heure, abandon silencieux', async () => {
    let clock = 0;
    const notes: string[] = [];
    const w = makeTxWatch({ store: makeStore(area()), check: async () => { throw new Error('réseau'); }, notify: (o) => notes.push(o), schedule: () => {}, now: () => clock });
    await w.add({ txid: 'x', chainId: 'solana', chainName: 'Solana', what: '1 SOL' });
    await w.tick();
    expect(await w.pending()).toBe(1);
    clock = 61 * 60_000;
    await w.tick();
    expect(await w.pending()).toBe(0);
    expect(notes).toEqual([]);
  });
});
