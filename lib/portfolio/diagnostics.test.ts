import { diagText } from './diagnostics';

it('le diagnostic partagé ne contient jamais de clé d’API', () => {
  const txt = diagText({ at: 0, ms: 5, erc20: { base: 'ÉCHEC Network request failed https://base-mainnet.g.alchemy.com/v2/6E1MABBp0KS-gBCc5zXk7' }, nativesFailed: [], prices: { asked: 3, got: 2, fx: 0.87 }, holdings: 4 });
  expect(txt).not.toContain('6E1MABBp0KS');
  expect(txt).toContain('base : ÉCHEC Network request failed');
});
