import * as engine from './index';

// Vérifie que le point d'entrée public expose bien la surface attendue :
// si un refactor casse le barrel, l'app mobile ne compilerait plus — on le
// détecte ici plutôt que dans l'app.
describe('barrel du moteur (src/index.ts)', () => {
  it('expose les fonctions crypto et chaînes essentielles', () => {
    for (const name of [
      'generateMnemonic',
      'validateMnemonic',
      'mnemonicToSeedSync',
      'deriveEvmAccount',
      'checkEvmAddress',
      'parseAmount',
      'createBackupChallenge',
      'getAdapter',
      'listChains',
    ] as const) {
      expect(typeof (engine as Record<string, unknown>)[name]).toBe('function');
    }
  });

  it('un bout de bout minimal fonctionne via le barrel', () => {
    const m = engine.generateMnemonic(128);
    expect(engine.validateMnemonic(m)).toBe(true);
    const seed = engine.mnemonicToSeedSync(m);
    const acct = engine.getAdapter('sepolia').deriveAccount(seed, 0);
    expect(engine.isValidEvmAddress(acct.address)).toBe(true);
  });
});
