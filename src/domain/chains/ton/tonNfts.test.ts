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

describe('nftTransferBody (transferts réels sur la chaîne)', () => {
  const { Cell } = require('@ton/core');
  const { nftTransferBody } = require('./tonNfts');
  const V = require('./ton-nft-transfer-vectors.json');
  const comment = (b64: string | null) => {
    if (!b64) return undefined;
    const s = Cell.fromBase64(b64).beginParse();
    if (s.remainingBits < 32 || s.loadUint(32) !== 0) return null;
    return s.loadStringTail() || null;
  };
  // Ce que Kalyx envoie : pas de charge personnalisée ; rien, ou un commentaire texte.
  const simple = V.transfers.filter((t: any) => t.custom_payload === null && comment(t.forward_payload) !== null);

  it('dispose de transferts réels comparables', () => {
    expect(simple.length).toBeGreaterThanOrEqual(5);
  });

  it.each(simple.map((t: any) => [t.transaction_hash, t]) as [string, any][])('redonne le corps exact de %s', (_h, t) => {
    const ours = nftTransferBody({ newOwner: t.new_owner, responseTo: t.response_destination, queryId: BigInt(t.query_id), forwardTon: BigInt(t.forward_amount), comment: comment(t.forward_payload) });
    expect(ours.hash().toString('hex')).toBe(Cell.fromBase64(t.body).hash().toString('hex'));
  });
});
