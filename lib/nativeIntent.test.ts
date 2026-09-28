import { redirectSystemPath } from '../app/+native-intent';

describe('Liens externes : aucun écran atteint directement', () => {
  it('démarrage à froid : toujours la racine, quel que soit le lien', () => {
    for (const path of ['kalyx://send?to=0xabc&amount=1&contract=0xdef&decimals=0', 'kalyx://reveal-phrase', 'https://kalyxwallet.com/pay?uri=x', 'kalyx://?v=2&id=1']) {
      expect(redirectSystemPath({ path, initial: true })).toBe('/');
    }
  });
  it('app ouverte : le routeur ne bouge pas (ui/DeepLinks traite le lien)', () => {
    expect(redirectSystemPath({ path: 'kalyx://send?to=0xabc', initial: false })).toBeNull();
    expect(redirectSystemPath({ path: 'kalyx://settings', initial: false })).toBeNull();
  });
});
