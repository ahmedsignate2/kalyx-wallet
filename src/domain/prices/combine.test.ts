// Test de la combinaison de séries (logique pure copiée ici pour rester dans src/).
import { combineSeries } from '../../../lib/portfolio/history';

describe('combineSeries', () => {
  it('pondère par montant et ajoute la constante', () => {
    const eth = [{ t: 0, v: 2000 }, { t: 10, v: 2100 }, { t: 20, v: 2200 }];
    const sol = [{ t: 0, v: 100 }, { t: 20, v: 110 }]; // granularité différente
    const out = combineSeries([{ amount: 1, points: eth }, { amount: 2, points: sol }], 500);
    expect(out.map((p) => p.v)).toEqual([2000 + 200 + 500, 2100 + 200 + 500, 2200 + 220 + 500]);
  });
  it('vide si aucune série', () => {
    expect(combineSeries([], 10)).toEqual([]);
  });
});
