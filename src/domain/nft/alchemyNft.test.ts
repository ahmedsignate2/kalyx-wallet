import { parseNfts, displayableImage, inlineSvg, getNfts } from './alchemyNft';

describe('parseNfts', () => {
  const json = {
    ownedNfts: [
      {
        contract: { address: '0xCollection', name: 'Cool Cats' },
        tokenId: '42',
        name: 'Cool Cat #42',
        image: { cachedUrl: 'http://img/42.png', thumbnailUrl: 'http://thumb/42.png' },
      },
      {
        contract: { address: '0xNoImage' },
        tokenId: '7',
        name: 'No image',
        image: {},
      },
      {
        // pas de contrat -> ignoré
        tokenId: '9',
        image: { cachedUrl: 'http://img/9.png' },
      },
    ],
  };

  it('normalise ; sans contrat = écarté, sans image mais nommé = gardé', () => {
    const nfts = parseNfts(json);
    expect(nfts).toHaveLength(2);
    expect(nfts[1]).toMatchObject({ contract: '0xNoImage', name: 'No image', image: '' });
    expect(nfts[0]).toEqual({
      contract: '0xCollection',
      tokenId: '42',
      name: 'Cool Cat #42',
      collection: 'Cool Cats',
      image: 'https://img/42.png',
      images: ['https://thumb/42.png'],
    });
  });

  it('nom de repli si absent', () => {
    const nfts = parseNfts({
      ownedNfts: [{ contract: { address: '0xA' }, tokenId: '5', image: { cachedUrl: 'http://i' } }],
    });
    expect(nfts[0].name).toBe('#5');
  });

  it('écarte le spam via contract.isSpam (filtrage client, plan gratuit)', () => {
    const nfts = parseNfts({
      ownedNfts: [
        { contract: { address: '0xSpam', name: 'Airdrop', isSpam: true }, tokenId: '1', image: { cachedUrl: 'http://i/1' } },
        { contract: { address: '0xReal', name: 'Legit' }, tokenId: '2', image: { cachedUrl: 'http://i/2' } },
      ],
    });
    expect(nfts).toHaveLength(1);
    expect(nfts[0].contract).toBe('0xReal');
  });

  it('robuste sur entrée invalide', () => {
    expect(parseNfts(null)).toEqual([]);
    expect(parseNfts({})).toEqual([]);
    expect(parseNfts({ ownedNfts: 'nope' })).toEqual([]);
  });
});

describe('Basenames et images non affichables', () => {
  it('un SVG passe en PNG, ipfs:// par une passerelle', () => {
    expect(displayableImage('https://base.org/api/basenames/kalyx.base.eth/assets/cardImage.svg')).toMatch(/^https:\/\/wsrv\.nl\/\?url=base\.org.*output=png/);
    expect(displayableImage('ipfs://Qm123/1.png')).toBe('https://ipfs.io/ipfs/Qm123/1.png');
    expect(displayableImage('data:image/svg+xml;base64,AAAA')).toBe('');
  });

  it('un Basename sans aperçu reste montré, avec son nom', () => {
    const nfts = parseNfts({
      ownedNfts: [
        { contract: { address: '0x03c4738Ee98aE44591e1A4A4F3CaB6641d95DD9a', name: 'Basenames' }, tokenId: '9', name: 'kalyx.base.eth', image: {} },
        { contract: { address: '0xAnon' }, tokenId: '3', image: {} },
      ],
    });
    // Pas d'aperçu chez Alchemy : l'image du service Basenames (SVG converti en PNG).
    expect(nfts).toEqual([{ contract: '0x03c4738Ee98aE44591e1A4A4F3CaB6641d95DD9a', tokenId: '9', name: 'kalyx.base.eth', collection: 'Basenames', image: expect.stringMatching(/^https:\/\/wsrv\.nl\/\?url=www\.base\.org%2Fapi%2Fbasenames%2Fkalyx\.base\.eth%2Fassets%2FcardImage\.svg&output=png/) }]);
  });

  it('SVG mis en cache SANS extension (Basename) : la version PNG passe avant', () => {
    const [n] = parseNfts({
      ownedNfts: [{
        contract: { address: '0x03c4738Ee98aE44591e1A4A4F3CaB6641d95DD9a', name: 'Basenames' }, tokenId: '9', name: 'kalyx.base.eth',
        image: { cachedUrl: 'https://nft-cdn.alchemy.com/base-mainnet/abc', pngUrl: 'https://res.cloudinary.com/alchemyapi/image/upload/convert-png/base-mainnet/abc', contentType: 'image/svg+xml', originalUrl: 'https://www.base.org/api/basenames/kalyx.base.eth/assets/cardImage.svg' },
      }],
    });
    expect(n.image).toBe('https://res.cloudinary.com/alchemyapi/image/upload/convert-png/base-mainnet/abc');
    expect(n.images?.[0]).toMatch(/^https:\/\/wsrv\.nl\/\?url=www\.base\.org/);
    expect([n.image, ...(n.images ?? [])]).not.toContain('https://nft-cdn.alchemy.com/base-mainnet/abc');
  });

  it('ENS sans image : celle du service ENS ; ar:// par une passerelle', () => {
    const [n] = parseNfts({ ownedNfts: [{ contract: { address: '0x57f1887a8BF19b14fC0dF6Fd9B2acc9Af147eA85', name: 'ENS' }, tokenId: '123', name: 'kalyx.eth', image: {} }] });
    expect(n.image).toMatch(/^https:\/\/wsrv\.nl\/\?url=metadata\.ens\.domains%2Fmainnet%2F0x57f1887a8bf19b14fc0df6fd9b2acc9af147ea85%2F123%2Fimage&output=png/);
    expect(displayableImage('ar://abc')).toBe('https://arweave.net/abc');
  });

  it('art on-chain : SVG du NFT dessiné tel quel, scripts refusés', () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg"><rect width="10" height="10"/></svg>';
    const [n] = parseNfts({ ownedNfts: [{ contract: { address: '0xArt', name: 'On-chain' }, tokenId: '1', image: {}, raw: { metadata: { image: `data:image/svg+xml;base64,${btoa(svg)}` } } }] });
    expect(n.svg).toBe(svg);
    expect(inlineSvg(`data:image/svg+xml;utf8,${encodeURIComponent(svg)}`)).toBe(svg);
    expect(inlineSvg('<svg onload="x()"></svg>')).toBe('');
    expect(inlineSvg('<svg><script>x()</script></svg>')).toBe('');
    expect(inlineSvg('<html></html>')).toBe('');
  });
});

describe('getNfts : pagination', () => {
  const chain = { id: 'base', rpcUrls: ['https://base-mainnet.g.alchemy.com/v2/KEY'] } as unknown as Parameters<typeof getNfts>[0];
  const page = (id: string, pageKey?: string) => ({ ok: true, status: 200, json: async () => ({ ownedNfts: [{ contract: { address: `0x${id}`, name: id }, tokenId: '1', image: { cachedUrl: `https://i/${id}.png` } }], pageKey }) });
  afterEach(() => { (global as { fetch?: unknown }).fetch = undefined; });

  it('lit les pages suivantes (le spam ne cache plus les vrais NFT), garde le lu si une page tombe', async () => {
    const urls: string[] = [];
    const replies = [page('a', 'k1'), page('b', 'k2'), { ok: false, status: 500, json: async () => ({}) }];
    (global as { fetch?: unknown }).fetch = jest.fn(async (u: string) => { urls.push(u); return replies.shift(); });
    const nfts = await getNfts(chain, '0xme');
    expect(nfts.map((n) => n.contract)).toEqual(['0xa', '0xb']);
    expect(urls[1]).toContain('&pageKey=k1');
  });
});
