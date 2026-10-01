import { tokenBrandColor } from './tokenColors';

describe('tokenBrandColor', () => {
  it('connaît les grands actifs et ne devine jamais', () => {
    expect(tokenBrandColor('solana')).toBe('#9945FF');
    expect(tokenBrandColor('bitcoin')).toBe('#F7931A');
    expect(tokenBrandColor('un-token-inconnu')).toBeNull();
    expect(tokenBrandColor(undefined)).toBeNull();
  });
});
