import { glyphFor, starPath, GLYPH_PALETTE } from './glyph';

describe('glyphe d’adresse', () => {
  const A = '0xd8dA6BF26964aF9D7eEd9e03E62415f8b1F2f8F7';
  it('déterministe et insensible à la casse', () => {
    expect(glyphFor(A)).toEqual(glyphFor(A.toLowerCase()));
    expect(glyphFor(A)).toEqual(glyphFor(`  ${A} `));
  });
  it('bornes', () => {
    for (const addr of [A, '5tzFkiKscXHK5ZXCGbXZxdw7gTjjD1mBwuoFbhUvuAi9', 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh', '0x0000000000000000000000000000000000000000']) {
      const g = glyphFor(addr);
      expect(g.points).toBeGreaterThanOrEqual(5);
      expect(g.points).toBeLessThanOrEqual(9);
      expect(g.inner).toBeGreaterThanOrEqual(0.35);
      expect(g.inner).toBeLessThanOrEqual(0.65);
      expect(g.colors[0]).not.toBe(g.colors[1]);
      expect(GLYPH_PALETTE).toContain(g.colors[0]);
    }
  });
  it('deux adresses proches (empoisonnement) → étoiles différentes', () => {
    const a = glyphFor('0xd8dA6BF26964aF9D7eEd9e03E62415f8b1F2f8F7');
    const b = glyphFor('0xd8dA6BF26964aF9D7eEd9e03E62415f8b1F2f8F8');
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(b));
  });
  it('chemin SVG fermé avec 2×points sommets', () => {
    const g = glyphFor(A);
    const d = starPath(g, 20, 20, 18);
    expect(d.startsWith('M') && d.endsWith('Z')).toBe(true);
    expect(d.split('L').length).toBe(g.points * 2);
  });
});
