import { beforeEach, describe, expect, test } from 'vitest';
import { makeAssets, MAX_CUSTOM, viewChains } from './assets';
import { makePortfolio, type Acct } from './portfolio';
import { makeNfts, safeImage } from './nfts';
import { makeStore, type StorageArea } from './storage';
import { WalletError } from './wallets';
import type { Holding } from '../../lib/portfolio/holdings';
import type { NftItem } from '../../src/domain/nft/alchemyNft';
import { activityT } from '../ui/i18n';

const EVM = '0x9858EfFD232B4033E47d90003D41EC34EcaEda94';
const SOL = 'HAgk14JpMQLgt6rVgv7cBQFJWFto5Dqxi472uT3DKpqk';
const ACCT: Acct = { evm: EVM, solana: SOL };
const TOKEN = '0x1111111111111111111111111111111111111111';
const OTHER = '0x2222222222222222222222222222222222222222';

function area(): StorageArea & { data: Record<string, unknown> } {
  const data: Record<string, unknown> = {};
  return {
    data,
    async get(keys) { return Object.fromEntries(keys.filter((k) => k in data).map((k) => [k, structuredClone(data[k])])); },
    async set(items) { Object.assign(data, structuredClone(items)); },
    async remove(keys) { for (const k of keys) delete data[k]; },
  };
}

let disk: ReturnType<typeof area>;
beforeEach(() => {
  disk = area();
});

/** Contrats simulés : ce que chacun « répond » sur le réseau. */
const contracts: Record<string, { symbol: string; name: string; decimals: number } | 'down'> = {
  [TOKEN]: { symbol: 'KLX', name: 'Kalyx Test', decimals: 6 },
  [OTHER]: { symbol: 'FREE', name: 'Claim your airdrop at x.com', decimals: 18 },
};
const balances = new Map<string, bigint | 'down'>();
const make = () =>
  makeAssets({
    disk: makeStore(disk),
    readMeta: async (_c, addr) => {
      const m = contracts[addr];
      if (!m || m === 'down') throw new Error('rpc');
      return m;
    },
    readBalance: async (chainId, addr) => {
      const b = balances.get(`${chainId}:${addr}`) ?? 0n;
      if (b === 'down') throw new Error('rpc');
      return b;
    },
  });

const reason = (p: Promise<unknown>) => p.then(() => 'ok', (e: Error) => (e instanceof WalletError ? e.message : 'other'));

describe('tokens ajoutés', () => {
  test('lu sur le contrat, avec le solde du compte ; relu à l’ajout', async () => {
    balances.set(`base:${TOKEN}`, 1_500_000n);
    const a = make();
    const c = await a.check('base', TOKEN.toUpperCase().replace('0X', '0x'), EVM);
    expect(c).toMatchObject({ chainId: 'base', contract: TOKEN, symbol: 'KLX', name: 'Kalyx Test', decimals: 6, raw: '1500000' });
    await a.add('base', TOKEN);
    expect(await a.customs()).toEqual([{ chainId: 'base', contract: TOKEN, symbol: 'KLX', name: 'Kalyx Test', decimals: 6 }]);
    expect(await reason(a.add('base', TOKEN))).toBe('TOKEN_EXISTS');
    await a.remove('base', TOKEN);
    expect(await a.customs()).toEqual([]);
  });

  test('refus : adresse invalide, réseau non EVM ou testnet, contrat muet, nom d’arnaque', async () => {
    const a = make();
    expect(await reason(a.check('base', '0x1234'))).toBe('BAD_CONTRACT');
    expect(await reason(a.check('solana', TOKEN))).toBe('BAD_CONTRACT');
    expect(await reason(a.check('sepolia', TOKEN))).toBe('BAD_CONTRACT');
    expect(await reason(a.check('base', '0x3333333333333333333333333333333333333333'))).toBe('TOKEN_UNREADABLE');
    expect(await reason(a.check('base', OTHER))).toBe('SUSPICIOUS_TOKEN');
  });

  test('symbole et nom nettoyés (ni HTML ni caractères invisibles)', async () => {
    contracts['0x4444444444444444444444444444444444444444'] = { symbol: '<b>US‮DC', name: 'Fake\u0000 <img> Coin', decimals: 6 };
    const c = await make().check('ethereum', '0x4444444444444444444444444444444444444444');
    expect(c.symbol).toBe('bUSDC');
    expect(c.name).toBe('Fake img Coin');
  });

  test(`au plus ${MAX_CUSTOM} tokens ajoutés`, async () => {
    const a = make();
    for (let i = 0; i < MAX_CUSTOM; i++) {
      const addr = `0x${(i + 16).toString(16).padStart(40, '5')}`;
      contracts[addr] = { symbol: `T${i}`, name: `Token ${i}`, decimals: 18 };
      await a.add('ethereum', addr);
    }
    expect(await reason(a.add('base', TOKEN))).toBe('TOO_MANY_TOKENS');
  });

  test('solde illisible : le réseau est muet, pas un 0', async () => {
    balances.set(`base:${TOKEN}`, 'down');
    const a = make();
    await a.add('base', TOKEN);
    const r = await a.balances(EVM);
    expect(r.items).toEqual([]);
    expect(r.failed).toEqual(['base']);
  });
});

describe('réseaux et tokens masqués', () => {
  test('un réseau se masque et revient ; jamais le dernier', async () => {
    const a = make();
    await a.setChainHidden('polygon', true);
    expect((await a.networks()).find((n) => n.id === 'polygon')?.hidden).toBe(true);
    await a.setChainHidden('polygon', false);
    expect((await a.prefs()).hiddenChains).toEqual([]);
    const all = viewChains().map((c) => c.id);
    for (const id of all.slice(1)) await a.setChainHidden(id, true);
    expect(await reason(a.setChainHidden(all[0], true))).toBe('LAST_NETWORK');
    expect(await reason(a.setChainHidden('inconnu', true))).toBe('BAD_REQUEST');
  });

  test('identifiant de token validé', async () => {
    const a = make();
    await a.setTokenHidden(`base:${TOKEN.toUpperCase().replace('0X', '0x')}`, true);
    expect((await a.prefs()).hiddenTokens).toEqual([`base:${TOKEN}`]);
    expect(await reason(a.setTokenHidden('base:<script>', true))).toBe('BAD_REQUEST');
  });
});

const native = (chainId: string, symbol: string, amount: number, price: number, extra: Partial<Holding> = {}): Holding => ({
  id: `${chainId}:native`,
  chainId,
  kind: 'native',
  symbol,
  name: symbol,
  decimals: 18,
  raw: 10n ** 18n,
  amount,
  price,
  fiat: amount * price,
  change24h: null,
  verified: true,
  ...extra,
});

describe('écran du portefeuille avec préférences', () => {
  const holdings = [native('ethereum', 'ETH', 1, 3000), native('polygon', 'POL', 100, 0.5), native('base', 'ETH', 0.1, 3000, { id: 'base:native' })];
  const portfolio = (assets = make()) => makePortfolio({ disk: makeStore(disk), t: activityT, locale: 'fr-FR', load: async () => holdings, assets });

  test('sans préférence : le total du cliché', async () => {
    const v = await portfolio().refresh(ACCT, 'eur');
    expect(v.total).toBe(3350);
    expect(v.custom).toEqual([]);
    expect(v.muted).toEqual([]);
  });

  test('réseau masqué : ses actifs sortent de l’écran et du total', async () => {
    const a = make();
    await a.setChainHidden('polygon', true);
    const v = await portfolio(a).refresh(ACCT, 'eur');
    expect(v.total).toBe(3300);
    expect([...v.main, ...v.small].some((h) => h.chainId === 'polygon')).toBe(false);
  });

  test('token masqué : à part, hors du total ; réaffiché, il revient', async () => {
    const a = make();
    await a.setTokenHidden('base:native', true);
    const p = portfolio(a);
    const v = await p.refresh(ACCT, 'eur');
    expect(v.total).toBe(3050);
    expect(v.muted.map((h) => h.id)).toEqual(['base:native']);
    await a.setTokenHidden('base:native', false);
    expect((await p.cached(ACCT, 'eur')).total).toBe(3350);
  });

  test('token ajouté : son groupe, sans prix, et le cliché du réseau muet est gardé', async () => {
    balances.set(`base:${TOKEN}`, 2_000_000n);
    const a = make();
    await a.add('base', TOKEN);
    const p = portfolio(a);
    const v = await p.refresh(ACCT, 'eur');
    expect(v.custom).toHaveLength(1);
    expect(v.custom[0]).toMatchObject({ symbol: 'KLX', amount: '2', custom: true, verified: false, fiat: 0 });
    expect(v.total).toBe(3350);
    balances.set(`base:${TOKEN}`, 'down');
    const w = await p.refresh(ACCT, 'eur');
    expect(w.custom[0].amount).toBe('2');
    expect(w.failed).toContain('Base');
    await a.remove('base', TOKEN);
    expect((await p.cached(ACCT, 'eur')).custom).toEqual([]);
  });

  test('un token muet ne double pas ses voisins du même réseau', async () => {
    const T2 = '0x6666666666666666666666666666666666666666';
    contracts[T2] = { symbol: 'TWO', name: 'Second', decimals: 18 };
    balances.set(`base:${TOKEN}`, 1_000_000n);
    balances.set(`base:${T2}`, 10n ** 18n);
    const a = make();
    await a.add('base', TOKEN);
    await a.add('base', T2);
    const p = portfolio(a);
    await p.refresh(ACCT, 'eur');
    balances.set(`base:${T2}`, 'down');
    const v = await p.refresh(ACCT, 'eur');
    expect(v.custom.map((h) => h.symbol).sort()).toEqual(['KLX', 'TWO']);
  });
});

describe('NFT', () => {
  const nft = (contract: string, tokenId: string, extra: Partial<NftItem> = {}): NftItem => ({ contract, tokenId, name: `#${tokenId}`, collection: 'Test', image: 'https://img.example/1.png', ...extra });

  test('lecture, explorateur, images sûres ; réseau muet nommé, son cliché gardé', async () => {
    let down = false;
    const n = makeNfts({
      disk: makeStore(disk),
      covers: () => true,
      fetch: async (chain) => {
        if (chain.id === 'ethereum') {
          if (down) throw new Error('relais');
          return [nft(TOKEN, '7', { images: ['javascript:alert(1)', 'http://plain.example/x.png', 'data:image/png;base64,AAAA'] })];
        }
        return [];
      },
    });
    const v = await n.refresh(ACCT);
    expect(v.items).toHaveLength(1);
    expect(v.items[0].images).toEqual(['https://img.example/1.png', 'data:image/png;base64,AAAA']);
    expect(v.items[0].explorer).toBe(`https://etherscan.io/token/${TOKEN}?a=7`);
    expect(v.failed).toEqual([]);
    down = true;
    const w = await n.refresh(ACCT);
    expect(w.items).toHaveLength(1);
    expect(w.failed).toEqual(['Ethereum']);
  });

  test('réseau masqué : ses NFT disparaissent', async () => {
    const n = makeNfts({ disk: makeStore(disk), covers: () => true, hiddenChains: async () => ['ethereum'], fetch: async (chain) => (chain.id === 'ethereum' ? [nft(TOKEN, '1')] : []) });
    expect((await n.refresh(ACCT)).items).toEqual([]);
  });

  test('SVG inscrit dans le NFT : dessiné en image, jamais en HTML', async () => {
    const n = makeNfts({ disk: makeStore(disk), covers: () => true, fetch: async (chain) => (chain.id === 'base' ? [nft(OTHER, '2', { image: '', svg: '<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>' })] : []) });
    const v = await n.refresh(ACCT);
    expect(v.items[0].images[0].startsWith('data:image/svg+xml;charset=utf-8,')).toBe(true);
    expect(safeImage('data:text/html;base64,PHNjcmlwdD4=')).toBeUndefined();
  });
});
