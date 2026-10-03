import { chainBrandColor, dominantSvgColor, tokenBrandColor, tokenTint } from './tokenColors';
import { CHAIN_LOGO_SVG } from '../src/domain/chains/chainLogos.generated';

describe('tokenBrandColor', () => {
  it('connaît les grands actifs et ne devine jamais', () => {
    expect(tokenBrandColor('solana')).toBe('#9945FF');
    expect(tokenBrandColor('bitcoin')).toBe('#F7931A');
    expect(tokenBrandColor('un-token-inconnu')).toBeNull();
    expect(tokenBrandColor(undefined)).toBeNull();
  });
});

describe('couleur des réseaux', () => {
  it('lit la teinte dominante d’un logo, en ignorant blancs, noirs et gris', () => {
    expect(dominantSvgColor('<svg><path fill="#FFFFFF"/><path fill="#E84142"/><path fill="#E84142"/><path fill="#111"/></svg>')).toBe('#E84142');
    expect(dominantSvgColor('<svg><path fill="#000"/><path fill="#ffffff"/></svg>')).toBeNull();
  });
  it('donne une couleur à chaque grand réseau EVM', () => {
    for (const id of ['ethereum', 'base', 'arbitrum', 'optimism', 'polygon', 'bnb', 'avalanche', 'linea', 'zksync', 'scroll', 'blast', 'unichain']) {
      expect(chainBrandColor(id, CHAIN_LOGO_SVG)).toMatch(/^#[0-9A-F]{6}$/i);
    }
    expect(chainBrandColor('avalanche', CHAIN_LOGO_SVG)).toBe('#E84142');
    expect(chainBrandColor('arbitrum', CHAIN_LOGO_SVG)).toBe('#28A0F0');
  });
  it('ETH sur Base prend la couleur de Base ; USDC garde la sienne', () => {
    expect(tokenTint('ethereum', 'base', CHAIN_LOGO_SVG)).toBe('#0052FF');
    expect(tokenTint('ethereum', 'ethereum', CHAIN_LOGO_SVG)).toBe('#627EEA');
    expect(tokenTint('usd-coin', 'polygon', CHAIN_LOGO_SVG)).toBe('#2775CA');
    expect(tokenTint(undefined, 'optimism', CHAIN_LOGO_SVG)).toBe('#FE0420');
    expect(tokenTint(undefined, undefined, CHAIN_LOGO_SVG)).toBeNull();
  });
  it('chaque jeton a SA couleur, même inconnu, et toujours la même', () => {
    const a = tokenTint('un-jeton-erc20', 'ethereum', CHAIN_LOGO_SVG);
    const b = tokenTint('un-autre-jeton', 'ethereum', CHAIN_LOGO_SVG);
    expect(a).toMatch(/^#[0-9A-F]{6}$/);
    expect(a).not.toBe(b);
    expect(a).toBe(tokenTint('un-jeton-erc20', 'ethereum', CHAIN_LOGO_SVG));
    expect(tokenTint('aave', 'ethereum', CHAIN_LOGO_SVG)).toBe('#B6509E');
    expect(tokenTint('uniswap', 'ethereum', CHAIN_LOGO_SVG)).toBe('#FF007A');
  });
});

describe('teintes utilitaires', () => {
  it('withAlpha et mixHex', () => {
    const { withAlpha, mixHex } = require('./tokenColors');
    expect(withAlpha('#9945FF', 0.2)).toBe('rgba(153,69,255,0.2)');
    expect(mixHex('#000000', '#FFFFFF', 0.5)).toBe('#808080');
  });
  it('jeton de swap : symbole d’abord, réseau ensuite', () => {
    const { swapTokenTint } = require('./tokenColors');
    expect(swapTokenTint('usdc', 'polygon', CHAIN_LOGO_SVG)).toBe('#2775CA');
    expect(swapTokenTint('ZZZ', 'arbitrum', CHAIN_LOGO_SVG)).toMatch(/^#[0-9A-F]{6}$/);
    expect(swapTokenTint(undefined, 'arbitrum', CHAIN_LOGO_SVG)).toBe('#28A0F0');
  });
});
