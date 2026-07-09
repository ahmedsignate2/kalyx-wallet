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
  });

  it('produit une URL https pour tous les réseaux mainnet couverts', () => {
    for (const c of listChains({ includeTestnets: false })) {
      const url = chainIconUrl(c.id);
      if (url) expect(url).toMatch(/^https:\/\/icons\.llamao\.fi\/icons\/chains\/rsz_[a-z0-9-]+\.jpg$/);
    }
  });
});
