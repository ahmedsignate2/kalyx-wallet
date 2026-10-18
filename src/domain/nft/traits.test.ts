import { parseTraits, parseRarity, withRarity } from './traits';
import { parseFloorPrice, parseNfts } from './alchemyNft';
import { parseDasNfts } from './solanaNft';

describe('traits', () => {
  it('format OpenSea, valeurs numériques et booléennes, entrées invalides écartées', () => {
    expect(
      parseTraits([
        { trait_type: 'Background', value: 'Blue' },
        { trait_type: 'Level', value: 7 },
        { traitType: 'Legendary', value: true },
        { trait_type: '', value: 'x' },
        { trait_type: 'Empty' },
        'n’importe quoi',
        null,
      ]),
    ).toEqual([
      { type: 'Background', value: 'Blue' },
      { type: 'Level', value: '7' },
      { type: 'Legendary', value: 'true' },
    ]);
  });

  it('caractères invisibles retirés, longueur et nombre bornés', () => {
    const t = parseTraits([{ trait_type: 'Ey​es', value: 'x'.repeat(200) }, ...Array.from({ length: 80 }, (_, i) => ({ trait_type: `t${i}`, value: 'v' }))]);
    expect(t[0]).toEqual({ type: 'Eyes', value: 'x'.repeat(64) });
    expect(t).toHaveLength(40);
  });

  it('rareté associée trait par trait, sans tenir compte de la casse', () => {
    const r = parseRarity({ rarities: [{ traitType: 'background', value: 'blue', prevalence: 0.031 }, { traitType: 'Hat', value: 'None', prevalence: 7 }] });
    expect(r).toEqual([{ type: 'background', value: 'blue', prevalence: 0.031 }]);
    expect(withRarity([{ type: 'Background', value: 'Blue' }, { type: 'Hat', value: 'Cap' }], r)).toEqual([
      { type: 'Background', value: 'Blue', prevalence: 0.031 },
      { type: 'Hat', value: 'Cap' },
    ]);
  });
});

describe('prix plancher', () => {
  it('getFloorPrice : OpenSea d’abord, LooksRare en repli, rien sans prix', () => {
    expect(parseFloorPrice({ openSea: { floorPrice: 1.25, priceCurrency: 'ETH', retrievedAt: '2026-10-18T10:00:00Z', collectionUrl: 'https://opensea.io/collection/x' } })).toEqual({
      price: 1.25,
      source: 'OpenSea',
      currency: 'ETH',
      at: '2026-10-18T10:00:00Z',
      url: 'https://opensea.io/collection/x',
    });
    expect(parseFloorPrice({ openSea: { error: 'unable to fetch' }, looksRare: { floorPrice: 0.9, priceCurrency: 'ETH' } })).toMatchObject({ price: 0.9, source: 'LooksRare' });
    expect(parseFloorPrice({ openSea: { floorPrice: 0 } })).toBeNull();
    // Lien vers un autre site : écarté.
    expect(parseFloorPrice({ openSea: { floorPrice: 1, collectionUrl: 'https://evil.example/x' } })?.url).toBeUndefined();
  });

  it('getNFTsForOwner : plancher et traits lus dans les métadonnées', () => {
    const [n] = parseNfts({
      ownedNfts: [
        {
          contract: { address: '0xabc', name: 'Coll', openSeaMetadata: { floorPrice: 0.42, lastIngestedAt: '2026-10-17T00:00:00Z', collectionSlug: 'coll' } },
          tokenId: '1',
          name: 'Coll #1',
          image: { cachedUrl: 'https://img.example/1.png' },
          raw: { metadata: { attributes: [{ trait_type: 'Fur', value: 'Gold' }] } },
        },
      ],
    });
    expect(n.floor).toEqual({ price: 0.42, source: 'OpenSea', at: '2026-10-17T00:00:00Z', url: 'https://opensea.io/collection/coll' });
    expect(n.traits).toEqual([{ type: 'Fur', value: 'Gold' }]);
  });

  it('sans relevé OpenSea : pas de plancher (jamais d’estimation)', () => {
    const [n] = parseNfts({ ownedNfts: [{ contract: { address: '0xabc', name: 'C', openSeaMetadata: { floorPrice: null } }, tokenId: '2', name: 'C #2', image: { cachedUrl: 'https://img.example/2.png' } }] });
    expect(n.floor).toBeUndefined();
  });
});

describe('Solana (DAS) : traits et compression', () => {
  it('lit les attributs et marque les NFT compressés', () => {
    const [a, b] = parseDasNfts({
      result: {
        items: [
          { id: 'MintA', content: { metadata: { name: 'Mad Lad #1', attributes: [{ trait_type: 'Eyes', value: 'Laser' }] }, files: [{ cdn_uri: 'https://cdn.example/a.png' }] } },
          { id: 'MintB', compression: { compressed: true }, content: { metadata: { name: 'Plain' }, files: [{ cdn_uri: 'https://cdn.example/b.png' }] } },
        ],
      },
    });
    expect(a.traits).toEqual([{ type: 'Eyes', value: 'Laser' }]);
    expect(a.compressed).toBeUndefined();
    expect(b.compressed).toBe(true);
  });
});
