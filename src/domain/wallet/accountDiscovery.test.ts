import { combineActivity, discoverAccountIndexes, type AccountActivity } from './accountDiscovery';

const probeFrom = (map: Record<number, AccountActivity>) => async (i: number) => map[i] ?? 'empty';

describe('discoverAccountIndexes', () => {
  it('avance tant qu’il y a de l’activité, s’arrête après 3 vides d’affilée', async () => {
    const r = await discoverAccountIndexes(probeFrom({ 1: 'used', 3: 'used', 6: 'used' }));
    expect(r.found).toEqual([1, 3, 6]);
    expect(r.lastChecked).toBe(9);
  });
  it('un inconnu n’arrête pas la recherche et n’est pas ajouté', async () => {
    const r = await discoverAccountIndexes(probeFrom({ 1: 'unknown', 2: 'unknown', 3: 'unknown', 4: 'used' }));
    expect(r.found).toEqual([4]);
    expect(r.uncertain).toEqual([1, 2, 3]);
  });
  it('une sonde qui lève compte comme inconnue ; borne max respectée', async () => {
    const r = await discoverAccountIndexes(async () => { throw new Error('rpc'); }, { max: 5 });
    expect(r.uncertain).toEqual([1, 2, 3, 4, 5]);
    expect(r.lastChecked).toBe(5);
  });
  it('les vides autour d’un inconnu ne se cumulent pas (il est peut-être utilisé)', async () => {
    const r = await discoverAccountIndexes(probeFrom({ 2: 'unknown', 5: 'used' }));
    expect(r.found).toEqual([5]); // 1 vide, 2 inconnu, 3-4 vides, 5 trouvé
  });
  it('réseau durablement muet : arrêt après 6 comptes sans activité, pas 20', async () => {
    const r = await discoverAccountIndexes(async () => 'unknown');
    expect(r.uncertain).toEqual([1, 2, 3, 4, 5, 6]);
    expect(r.lastChecked).toBe(6);
  });
  it('les comptes déjà présents prolongent la recherche sans être rajoutés', async () => {
    const r = await discoverAccountIndexes(probeFrom({ 5: 'used' }), { known: new Set([2, 3]) });
    expect(r.found).toEqual([5]);
  });
});

describe('combineActivity', () => {
  it('utilisé si un réseau l’est ; vide seulement si tous ont répondu vide', () => {
    expect(combineActivity(['empty', 'used', 'unknown'])).toBe('used');
    expect(combineActivity(['empty', 'empty'])).toBe('empty');
    expect(combineActivity(['empty', 'unknown'])).toBe('unknown');
    expect(combineActivity([])).toBe('unknown');
  });
});
