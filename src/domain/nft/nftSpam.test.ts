import LIVE from './helius-das-live.json';
import { parseDasNfts } from './solanaNft';
import { isSpamNft } from './nftSpam';
import { parseNfts } from './alchemyNft';

describe('NFT Solana réels (Helius DAS)', () => {
  const nfts = parseDasNfts(LIVE);
  const names = nfts.map((n) => n.name);

  it('les vraies collections restent', () => {
    for (const n of ['Mad Lads #7972', 'Quekz #3976', 'Pythenians #2540', 'Mad Lads Loot Box', 'Claynosaurz Loot Box']) expect(names).toContain(n);
  });

  it('les arnaques sont écartées, y compris espaces invisibles et lettres cyrilliques', () => {
    for (const n of ['Claim You BOME', '🎁2.0 Jupiter AirDrop', '4000$ W Drop 4000W.io', '2400JUP Drop Box', 'RAYD.PROMO Limited Gift', 'Claim your 5000WIF', '$ARMENI', '3000$W Token Ticket', '🎁WEN Voucher', 'JUP Third round Drop', 'Solana SCX Shopping Voucher', 'FOMO 0% HOUSE EDGE GAMES', 'FOLLOW @SlerfPFPs', 'Limited Drop', 'Drop Pass'])
      expect(names).not.toContain(n);
    // « U​SD​C VO​UC​HER » : nom vide, collection truffée d'espaces de largeur nulle.
    expect(nfts.some((n) => /V.?O.?U.?C.?H.?E.?R/i.test(n.collection))).toBe(false);
    expect(nfts.length).toBeLessThan(LIVE.result.items.length / 2);
  });

  it('collection par son NOM (plus l’adresse base58), image en cache Helius', () => {
    const lad = nfts.find((n) => n.name === 'Mad Lads #7972')!;
    expect(lad.collection).toBe('Mad Lads');
    expect(lad.image).toMatch(/^https:\/\//);
    expect(lad.url).toBe(`https://solscan.io/token/${lad.tokenId}`);
  });
});

describe('Règles de nom', () => {
  it('une vraie collection au nom banal passe ; seul un NFT compressé est jugé sur « drop »', () => {
    expect(isSpamNft({ name: 'Drop #12', collection: 'Drops', compressed: false })).toBe(false);
    expect(isSpamNft({ name: 'Drop #12', collection: 'Drops', compressed: true })).toBe(true);
    expect(isSpamNft({ name: 'kalyx.base.eth', collection: 'Basenames' })).toBe(false);
  });

  it('EVM : les mêmes règles s’ajoutent à isSpam d’Alchemy', () => {
    const out = parseNfts({ ownedNfts: [
      { contract: { address: '0xA', name: 'Visit claim-eth.com' }, tokenId: '1', name: 'Reward', image: { cachedUrl: 'https://i/1' } },
      { contract: { address: '0xB', name: 'Basenames' }, tokenId: '2', name: 'kalyx.base.eth', image: { cachedUrl: 'https://i/2' } },
    ] });
    expect(out.map((n) => n.contract)).toEqual(['0xB']);
  });
});
