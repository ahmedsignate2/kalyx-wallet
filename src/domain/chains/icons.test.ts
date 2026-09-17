import { chainIconUrl } from './icons';
import { listChains } from './registry';

describe('chainIconUrl', () => {
  it('mappe les slugs particuliers (bnb -> bsc, zksync -> zksync-era)', () => {
    expect(chainIconUrl('bnb')).toContain('rsz_bsc.jpg');
    expect(chainIconUrl('zksync')).toContain('rsz_zksync-era.jpg');
    expect(chainIconUrl('worldchain')).toContain('rsz_world-chain.jpg');
  });

  it('utilise l’id tel quel par défaut', () => {
    expect(chainIconUrl('base')).toContain('rsz_base.jpg');
    expect(chainIconUrl('arbitrum')).toContain('rsz_arbitrum.jpg');
  });

  it('renvoie undefined pour les réseaux sans icône connue (repli lettré)', () => {
    expect(chainIconUrl('sepolia')).toBeUndefined();
    expect(chainIconUrl('monad-testnet')).toBeUndefined();
    expect(chainIconUrl('gravity')).toBeUndefined();
    expect(chainIconUrl('memecore')).toBeUndefined();
    expect(chainIconUrl('base-sepolia')).toBeUndefined();
    expect(chainIconUrl('solana-devnet')).toBeUndefined();
  });

  it('produit une URL https (proxy PNG) pour tous les réseaux mainnet couverts', () => {
    for (const c of listChains({ includeTestnets: false })) {
      const url = chainIconUrl(c.id);
      if (url) {
        expect(url).toMatch(/^https:\/\/wsrv\.nl\/\?url=/);
        expect(url).toContain('output=png'); // décodable par RN sur iOS + Android
        expect(url).toContain('rsz_'); // pointe bien vers l'icône DefiLlama
      }
    }
  });
});
