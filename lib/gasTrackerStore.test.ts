import { gasLevel } from './gasTrackerStore';

/*
 * La version précédente classait ainsi :
 *
 *   if (gwei < 20) low; else if (gwei > 40) high; else if (gwei > 80) surge;
 *
 * « surge » était donc INATTEIGNABLE — 100 gwei satisfait `> 40` et sort en
 * « high ». Aucun type ne peut attraper ça : la faute est dans l'ORDRE des
 * branches, pas dans les valeurs. D'où ce test, qui vérifie surtout que chaque
 * niveau est atteignable.
 */
describe('gasLevel', () => {
  it('atteint les quatre niveaux', () => {
    const atteints = new Set([1, 15, 45, 150].map(gasLevel));
    expect(atteints).toEqual(new Set(['low', 'normal', 'high', 'surge']));
  });

  it('classe dans l’ordre croissant', () => {
    expect(gasLevel(5)).toBe('low');
    expect(gasLevel(20)).toBe('normal');
    expect(gasLevel(50)).toBe('high');
    expect(gasLevel(200)).toBe('surge');
  });

  it('range les bornes dans le niveau supérieur', () => {
    expect(gasLevel(9.99)).toBe('low');
    expect(gasLevel(10)).toBe('normal');
    expect(gasLevel(29.99)).toBe('normal');
    expect(gasLevel(30)).toBe('high');
    expect(gasLevel(79.99)).toBe('high');
    expect(gasLevel(80)).toBe('surge');
  });

  it('ne casse pas sur zéro', () => {
    expect(gasLevel(0)).toBe('low');
  });
});
