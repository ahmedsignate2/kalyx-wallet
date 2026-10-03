import { parseNfts, displayableImage } from './alchemyNft';

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
    expect(nfts).toEqual([{ contract: '0x03c4738Ee98aE44591e1A4A4F3CaB6641d95DD9a', tokenId: '9', name: 'kalyx.base.eth', collection: 'Basenames', image: '' }]);
  });
});
