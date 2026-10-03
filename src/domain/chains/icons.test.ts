import { chainIconUrl, embeddedChainLogo, CHAIN_LOGO_PREFIX } from './icons';
import { CHAIN_LOGO_SVG } from './chainLogos.generated';
import { listChains } from './registry';

describe('chainIconUrl', () => {
  it('désigne le logo embarqué quand il existe', () => {
    for (const id of ['ethereum', 'bnb', 'base', 'arbitrum', 'bitcoin', 'solana', 'ton']) {
      expect(chainIconUrl(id)).toBe(CHAIN_LOGO_PREFIX + id);
    }
  });

  it('donne un logo aux réseaux de test, celui de leur réseau principal', () => {
    expect(CHAIN_LOGO_SVG['sepolia']).toBe(CHAIN_LOGO_SVG['ethereum']);
    expect(CHAIN_LOGO_SVG['base-sepolia']).toBe(CHAIN_LOGO_SVG['base']);
    expect(CHAIN_LOGO_SVG['ton-testnet']).toBe(CHAIN_LOGO_SVG['ton']);
  });

  it('retombe sur l’image distante (proxy PNG) sans logo embarqué', () => {
    const url = chainIconUrl('morph');
    expect(url).toMatch(/^https:\/\/wsrv\.nl\/\?url=/);
    expect(url).toContain('output=png'); // décodable par RN sur iOS + Android
    expect(url).toContain('rsz_morph.jpg');
  });

  it('renvoie undefined sans logo embarqué ni icône distante (repli lettré)', () => {
    expect(chainIconUrl('memecore')).toBeUndefined();
  });

  it('chaque réseau a une icône, sauf ceux explicitement laissés au repli lettré', () => {
    const sansIcone = listChains({ includeTestnets: true }).filter((c) => !chainIconUrl(c.id)).map((c) => c.id);
    expect(sansIcone).toEqual(['memecore']);
  });
});

describe('embeddedChainLogo', () => {
  it('rend le SVG pour une URI embarquée, rien pour une URL ordinaire', () => {
    expect(embeddedChainLogo(chainIconUrl('ethereum'))).toMatch(/^<svg[\s\S]*<\/svg>$/);
    expect(embeddedChainLogo('https://example.com/a.png')).toBeUndefined();
    expect(embeddedChainLogo(undefined)).toBeUndefined();
    expect(embeddedChainLogo(`${CHAIN_LOGO_PREFIX}inconnu`)).toBeUndefined();
  });

  it('chaque SVG est vectoriel et sans image bitmap cachée', () => {
    for (const svg of Object.values(CHAIN_LOGO_SVG)) {
      expect(svg).toMatch(/^<svg [^>]*viewBox="0 0 24 24"/);
      expect(svg).not.toMatch(/<image|data:image/);
    }
  });
});
