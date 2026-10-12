import { displayableLogoUri, isSvgUri } from './logoUri';

describe('logos distants chargeables sur iOS', () => {
  it('http passe en https (App Transport Security)', () => {
    expect(displayableLogoUri('http://x.org/a.png')).toBe('https://x.org/a.png');
    expect(displayableLogoUri('https://x.org/a.png')).toBe('https://x.org/a.png');
  });
  it('ipfs:// passe par une passerelle', () => {
    expect(displayableLogoUri('ipfs://Qm1/logo.png')).toBe('https://ipfs.io/ipfs/Qm1/logo.png');
    expect(displayableLogoUri('ipfs://ipfs/Qm1')).toBe('https://ipfs.io/ipfs/Qm1');
  });
  it('reconnaît un SVG, requête et fragment compris', () => {
    expect(isSvgUri('https://app.uniswap.org/favicon.svg')).toBe(true);
    expect(isSvgUri('https://x.org/logo.SVG?v=2')).toBe(true);
    expect(isSvgUri('https://x.org/logo.png')).toBe(false);
    expect(isSvgUri('https://x.org/a.png?f=.svg')).toBe(false);
    expect(isSvgUri('data:image/png;base64,AAA')).toBe(false);
  });
});
