import { parseNfts } from './alchemyNft';

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

  it('normalise et ne garde que les NFT avec contrat + image', () => {
    const nfts = parseNfts(json);
    expect(nfts).toHaveLength(1);
    expect(nfts[0]).toEqual({
      contract: '0xCollection',
      tokenId: '42',
      name: 'Cool Cat #42',
      collection: 'Cool Cats',
      image: 'http://img/42.png',
    });
  });

  it('nom de repli si absent', () => {
    const nfts = parseNfts({
      ownedNfts: [{ contract: { address: '0xA' }, tokenId: '5', image: { cachedUrl: 'http://i' } }],
    });
    expect(nfts[0].name).toBe('#5');
  });

  it('robuste sur entrée invalide', () => {
    expect(parseNfts(null)).toEqual([]);
    expect(parseNfts({})).toEqual([]);
    expect(parseNfts({ ownedNfts: 'nope' })).toEqual([]);
  });
});
