import { beforeEach, describe, expect, test } from 'vitest';
import { makePortfolio, type Acct } from './portfolio';
import { makeHome } from './home';
import { makeSession } from './session';
import { makeStore, type StorageArea } from './storage';
import { makeWallets } from './wallets';
import type { Holding } from '../../lib/portfolio/holdings';
import type { TxSummary } from '../../src/domain/chains/types';
import { activityT } from '../ui/i18n';

const EVM = '0x9858EfFD232B4033E47d90003D41EC34EcaEda94';
const SOL = 'HAgk14JpMQLgt6rVgv7cBQFJWFto5Dqxi472uT3DKpqk';
const ACCT: Acct = { evm: EVM, solana: SOL };

function area(): StorageArea & { data: Record<string, unknown> } {
  const data: Record<string, unknown> = {};
  return {
    data,
    async get(keys) { return Object.fromEntries(keys.filter((k) => k in data).map((k) => [k, structuredClone(data[k])])); },
    async set(items) { Object.assign(data, structuredClone(items)); },
    async remove(keys) { for (const k of keys) delete data[k]; },
  };
}

const holding = (chainId: string, symbol: string, amount: number, price: number, extra: Partial<Holding> = {}): Holding => ({
  id: `${chainId}:native`,
  chainId,
  kind: 'native',
  symbol,
  name: symbol,
  decimals: 18,
  raw: BigInt(Math.round(amount * 1e6)) * 10n ** 12n,
  amount,
  price,
  fiat: amount * price,
  change24h: null,
  verified: true,
  ...extra,
});

type Load = NonNullable<Parameters<typeof makePortfolio>[0]['load']>;
/** Lecture simulée : ce que chaque réseau « répond », et ceux qui se taisent. */
const loader = (holdings: Holding[], silent: string[] = []): Load => async (_a, _f, _t, failed) => {
  for (const s of silent) failed?.add(s);
  return holdings;
};

let disk: ReturnType<typeof area>;
let clock = 1_000_000;
beforeEach(() => {
  disk = area();
  clock = 1_000_000;
});
const make = (load: Load, history?: (c: string, a: string) => Promise<TxSummary[]>) =>
  makePortfolio({ disk: makeStore(disk), t: activityT, locale: 'fr-FR', now: () => clock, load, history });

describe('Bitcoin', () => {
  const BTC = 'bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu';
  test('solde BTC lu avec l’adresse bc1 du compte, compté dans le total', async () => {
    let seen: { btcAddress?: string } = {};
    const load: Load = async (a) => ((seen = a), [holding('bitcoin', 'BTC', 0.01, 60000, { id: 'bitcoin:native', decimals: 8, raw: 1_000_000n }), holding('ethereum', 'ETH', 0.5, 3000)]);
    const v = await make(load).refresh({ ...ACCT, bitcoin: BTC }, 'eur');
    expect(seen.btcAddress).toBe(BTC);
    expect(v.total).toBe(2100);
    expect(v.main.map((h) => h.symbol)).toContain('BTC');
  });

  test('activité Bitcoin lue à l’adresse bc1', async () => {
    const asked: string[] = [];
    const p = make(loader([holding('bitcoin', 'BTC', 0.01, 60000, { id: 'bitcoin:native', decimals: 8, raw: 1_000_000n })]), async (c, a) => (asked.push(`${c}:${a}`), []));
    await p.refresh({ ...ACCT, bitcoin: BTC }, 'eur');
    await p.refreshActivity({ ...ACCT, bitcoin: BTC }, 'eur');
    expect(asked).toContain(`bitcoin:${BTC}`);
    // Sans adresse Bitcoin (clé importée EVM/Solana) : le réseau n'est pas interrogé.
    asked.length = 0;
    await p.refreshActivity(ACCT, 'eur');
    expect(asked.some((x) => x.startsWith('bitcoin:'))).toBe(false);
  });
});

describe('soldes', () => {
  test('jamais lu : total INCONNU (null), pas 0', async () => {
    const p = make(loader([]));
    const v = await p.cached(ACCT, 'eur');
    expect(v.total).toBeNull();
    expect(v.at).toBe(0);
    expect(v.stale).toBe(true);
  });

  test('lecture : total, tri, montant formaté ; le cliché est relu sans réseau', async () => {
    const p = make(loader([holding('solana', 'SOL', 2, 150, { id: 'solana:native', decimals: 9, raw: 2_000_000_000n }), holding('ethereum', 'ETH', 0.5, 3000)]));
    const v = await p.refresh(ACCT, 'eur');
    expect(v.total).toBe(1800);
    expect(v.main.map((h) => h.symbol)).toEqual(['ETH', 'SOL']);
    expect(v.main[0].chainName).toBe('Ethereum');
    expect(v.main[1].amount).toBe('2');
    expect(v.failed).toEqual([]);
    const c = await make(loader([])).cached(ACCT, 'eur');
    expect(c.total).toBe(1800);
    expect(c.stale).toBe(false);
    clock += 60_000;
    expect((await make(loader([])).cached(ACCT, 'eur')).stale).toBe(true);
  });

  test('réseau muet : NOMMÉ, et ses actifs de la lecture précédente restent', async () => {
    await make(loader([holding('ethereum', 'ETH', 1, 3000), holding('polygon', 'POL', 100, 0.5)])).refresh(ACCT, 'eur');
    const v = await make(loader([holding('ethereum', 'ETH', 1, 3000)], ['polygon:native'])).refresh(ACCT, 'eur');
    expect(v.failed).toEqual(['Polygon']);
    expect(v.main.map((h) => h.symbol).sort()).toEqual(['ETH', 'POL']);
    expect(v.total).toBe(3050);
  });

  test('aucun réseau ne répond et rien en cache : total inconnu, réseaux nommés', async () => {
    const v = await make(loader([], ['ethereum:native', 'solana:native'])).refresh(ACCT, 'eur');
    expect(v.total).toBeNull();
    expect(v.failed).toEqual(['Ethereum', 'Solana']);
  });

  test('réseaux servis seulement : TON compté, un réseau inconnu de l’extension écarté', async () => {
    const v = await make(loader([holding('ethereum', 'ETH', 1, 10), holding('ton', 'TON', 5, 5, { id: 'ton:native' }), holding('cosmoshub', 'ATOM', 3, 5, { id: 'cosmoshub:native' })])).refresh(ACCT, 'usd');
    expect(v.main.map((h) => h.symbol)).toEqual(['TON', 'ETH']);
  });

  test('TON : clé publique transmise, adresse calculée par réseau', async () => {
    let seen: { tonPublicKey?: string } = {};
    const load: Load = async (a) => ((seen = a), []);
    await make(load).refresh({ ...ACCT, ton: 'UQ…', tonPub: 'ab'.repeat(32) }, 'usd');
    expect(seen.tonPublicKey).toBe('ab'.repeat(32));
  });

  test('token non vérifié : masqué, sans valeur, jamais dans le total', async () => {
    const spam = holding('ethereum', 'FREE', 1_000_000, 0, { id: 'ethereum:0xspam', kind: 'erc20', contract: '0xspam', verified: false, fiat: 0 });
    const v = await make(loader([holding('ethereum', 'ETH', 1, 10), spam])).refresh(ACCT, 'usd');
    expect(v.hidden.map((h) => h.symbol)).toEqual(['FREE']);
    expect(v.total).toBe(10);
  });

  test('un logo d’indexeur qui n’est pas https est ignoré', async () => {
    const v = await make(loader([holding('ethereum', 'ETH', 1, 10, { logo: 'javascript:alert(1)' }), holding('base', 'ETH', 1, 10, { id: 'base:native', logo: 'https://x.test/eth.png' })])).refresh(ACCT, 'usd');
    expect(v.main.map((h) => h.logo)).toEqual(expect.arrayContaining([undefined, 'https://x.test/eth.png']));
  });

  test('deux actualisations simultanées : une seule lecture réseau', async () => {
    let calls = 0;
    const p = make(async () => (calls++, [holding('ethereum', 'ETH', 1, 10)]));
    await Promise.all([p.refresh(ACCT, 'usd'), p.refresh(ACCT, 'usd')]);
    expect(calls).toBe(1);
  });
});

describe('activité', () => {
  const tx = (o: Partial<TxSummary>): TxSummary => ({ chain: 'ethereum', hash: '0xaa', from: '0x1111111111111111111111111111111111111111', to: EVM, value: 10n ** 17n, timestamp: 1_700_000_000, direction: 'in', status: 'success', ...o });

  test('phrases lisibles, triées, dédoublonnées ; montants bigint conservés par le cache', async () => {
    const history = async (c: string) =>
      c === 'ethereum'
        ? [tx({ hash: '0xa1' }), tx({ hash: '0xa1' }), tx({ hash: '0xa2', direction: 'out', from: EVM, to: '0x2222222222222222222222222222222222222222', timestamp: 1_700_000_100 })]
        : [];
    const p = make(loader([holding('ethereum', 'ETH', 1, 3000)]), history);
    await p.refresh(ACCT, 'eur');
    const v = await p.refreshActivity(ACCT, 'eur');
    expect(v.rows.map((r) => r.hash)).toEqual(['0xa2', '0xa1']);
    expect(v.rows[1].amount).toContain('0.1');
    expect(v.rows[1].explorer).toBe('https://etherscan.io/tx/0xa1');
    const again = await make(loader([]), async () => []).cachedActivity(ACCT, 'eur');
    expect(again.rows.map((r) => r.hash)).toEqual(['0xa2', '0xa1']);
  });

  test('spam (token à 0, sosie d’adresse) : masqué et compté', async () => {
    const history = async (c: string) =>
      c === 'ethereum' ? [tx({ hash: '0xb1' }), tx({ hash: '0xb2', asset: 'USDT', contract: '0xdead', value: 0n, decimals: 6 })] : [];
    const v = await make(loader([]), history).refreshActivity(ACCT, 'eur');
    expect(v.rows.map((r) => r.hash)).toEqual(['0xb1']);
    expect(v.hiddenCount).toBe(1);
  });

  test('réseau muet : nommé, et son historique précédent reste', async () => {
    await make(loader([]), async (c) => (c === 'solana' ? [tx({ chain: 'solana', hash: 'sig1', to: SOL, value: 10n ** 9n })] : [])).refreshActivity(ACCT, 'eur');
    const v = await make(loader([]), async (c) => {
      if (c === 'solana') throw new Error('muet');
      return [];
    }).refreshActivity(ACCT, 'eur');
    expect(v.failed).toEqual(['Solana']);
    expect(v.rows.map((r) => r.hash)).toEqual(['sig1']);
  });

  test('liste vide d’un réseau muet aux soldes : comptée comme muette, pas « aucune activité »', async () => {
    const p = make(loader([], ['solana:native']), async () => []);
    await p.refresh(ACCT, 'eur');
    const v = await p.refreshActivity(ACCT, 'eur');
    expect(v.failed).toEqual(['Solana']);
  });
});

describe('écran principal', () => {
  let session: ReturnType<typeof makeSession>;
  let home: ReturnType<typeof makeHome>;
  beforeEach(async () => {
    session = makeSession({ disk: makeStore(disk), session: makeStore(area()), alarms: { create() {}, clear() {} }, kdf: { N: 1 << 10, r: 8, p: 1 } });
    const wallets = makeWallets(makeStore(disk), session);
    home = makeHome(makeStore(disk), session, wallets, make(loader([holding('ethereum', 'ETH', 1, 10)])), 'eur');
    await session.create('Plage-Orange-47!');
    await wallets.importPhrase('abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about');
  });

  test('déverrouillé : compte affiché, devise, cliché ; verrouillé : rien', async () => {
    const g = await home.get();
    expect(g.selected?.index).toBe(0);
    expect(g.fiat).toBe('eur');
    expect(g.portfolio?.total).toBeNull();
    await home.refresh();
    expect((await home.get()).portfolio?.total).toBe(10);
    await session.lock();
    const locked = await home.get();
    expect(locked.portfolio).toBeUndefined();
    await expect(home.refresh()).rejects.toThrow('LOCKED');
    await expect(home.activity(false)).rejects.toThrow('LOCKED');
  });

  test('choix refusés : compte inconnu, devise inconnue', async () => {
    await expect(home.select('w-inconnu', 0)).rejects.toThrow('UNKNOWN_ACCOUNT');
    await expect(home.setFiat('btc')).rejects.toThrow('BAD_SETTING');
    await home.setFiat('usd');
    expect((await home.get()).fiat).toBe('usd');
  });
});
