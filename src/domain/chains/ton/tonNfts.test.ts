import LIVE from './tonapi-nfts-live.json';
import { normalizeTonDomain, parseDnsWallet, parseTonNfts } from './tonNfts';
import { TonApiClient } from './tonApi';

describe('parseTonNfts (compte réel, moitié d’arnaques)', () => {
  const list = parseTonNfts(LIVE.nfts);

  it('écarte les « vouchers » d’arnaque : liste noire ou sans collection', () => {
    expect(list.some((n) => /voucher|bonus/i.test(n.name))).toBe(false);
    expect(list.length).toBeLessThan(LIVE.nfts.nft_items.length);
  });

  it('garde les vrais NFT de collection et les domaines .ton', () => {
    expect(list.find((n) => n.name === 'Surge Board #12691')).toMatchObject({ collectionName: 'Surge Boards' });
    const domains = list.filter((n) => n.dns).map((n) => n.name);
    expect(domains).toEqual(expect.arrayContaining(['blackhat-adwords.ton', 'mygoldtonnft.ton']));
  });

  it('images converties en PNG 500 px', () => {
    for (const n of list) if (n.image) expect(n.image).toMatch(/^https:\/\/wsrv\.nl\/.*output=png&w=500/);
  });
});

describe('noms .ton', () => {
  it('normalise et refuse ce qui n’est pas un nom TON', () => {
    expect(normalizeTonDomain('  Foundation.TON ')).toBe('foundation.ton');
    expect(normalizeTonDomain('alice.t.me')).toBe('alice.t.me');
    expect(normalizeTonDomain('vitalik.eth')).toBeNull();
    expect(normalizeTonDomain('a..ton')).toBeNull();
    expect(normalizeTonDomain('UQC020bHeiUqqyw8BB4EttblmRidKkT_hnINJ-8rZCP0L1Dw')).toBeNull();
  });

  it('résolution réelle : adresse conviviale non rebondissante', () => {
    expect(parseDnsWallet(LIVE.dnsFoundation, false)).toMatch(/^UQ/);
    expect(parseDnsWallet(LIVE.dnsNotFound, false)).toBeNull();
  });

  it('client : 404 = nom inexistant, nom invalide jamais envoyé', async () => {
    const paths: string[] = [];
    const c = new TonApiClient('https://p/n', async (u) => {
      paths.push(u);
      return u.includes('foundation') ? { status: 200, text: async () => JSON.stringify(LIVE.dnsFoundation) } : { status: 404, text: async () => '{"error":"entity not found"}' };
    });
    expect(await c.resolveDomain('Foundation.ton', false)).toMatch(/^UQ/);
    expect(await c.resolveDomain('absent.ton', false)).toBeNull();
    expect(await c.resolveDomain('evil/../x', false)).toBeNull();
    expect(paths).toEqual(['https://p/n/v2/dns/foundation.ton/resolve', 'https://p/n/v2/dns/absent.ton/resolve']);
  });
});
