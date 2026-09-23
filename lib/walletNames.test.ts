import { walletDisplayName, accountDisplayName, isLegacyDefaultName } from './walletNames';
import type { WalletMeta } from './secureStore';

/** Traducteurs minces : on teste la LOGIQUE de nommage, pas les traductions. */
const EN: Record<string, string> = {
  walletDefaultMain: 'Main wallet', walletDefaultN: 'Wallet {n}', walletDefaultKey: 'Imported key {n}',
  accountDefaultMain: 'Main account', accountDefaultN: 'Account {n}',
};
const JA: Record<string, string> = {
  walletDefaultMain: 'メインウォレット', walletDefaultN: 'ウォレット {n}', walletDefaultKey: 'インポートした鍵 {n}',
  accountDefaultMain: 'メインアカウント', accountDefaultN: 'アカウント {n}',
};
const t = (d: Record<string, string>) => ((k: string) => d[k]) as Parameters<typeof walletDisplayName>[2];

const w = (label: string, type?: 'seed' | 'privateKey'): WalletMeta => ({ id: 'x', label, type });

describe('noms par défaut traduits, noms choisis intacts', () => {
  it('traduit le nom par défaut du premier wallet', () => {
    expect(walletDisplayName(w(''), 0, t(EN))).toBe('Main wallet');
    expect(walletDisplayName(w(''), 0, t(JA))).toBe('メインウォレット');
  });

  it('numérote les suivants', () => {
    expect(walletDisplayName(w(''), 1, t(EN))).toBe('Wallet 2');
    expect(walletDisplayName(w(''), 2, t(EN))).toBe('Wallet 3');
  });

  it('distingue un wallet clé privée', () => {
    expect(walletDisplayName(w('', 'privateKey'), 1, t(EN))).toBe('Imported key 2');
  });

  it('ne TOUCHE JAMAIS un nom choisi par l’utilisateur', () => {
    // Le nom de quelqu'un n'est pas du texte d'interface : il ne se traduit pas.
    expect(walletDisplayName(w('Épargne Marie'), 0, t(EN))).toBe('Épargne Marie');
    expect(walletDisplayName(w('Épargne Marie'), 0, t(JA))).toBe('Épargne Marie');
  });

  it('comptes : principal puis numérotés sur l’indice HD', () => {
    expect(accountDisplayName({ index: 0, label: '' }, t(EN))).toBe('Main account');
    expect(accountDisplayName({ index: 3, label: '' }, t(EN))).toBe('Account 4');
    expect(accountDisplayName({ index: 3, label: 'Trading' }, t(EN))).toBe('Trading');
  });
});

describe('migration des libellés français déjà en stockage', () => {
  it('reconnaît ceux que les versions précédentes écrivaient', () => {
    for (const l of [
      'Portefeuille principal', 'Portefeuille 2', 'Portefeuille importé 3',
      'Clé importée 1', 'Compte principal', 'Compte 4', 'Compte importé',
    ]) {
      expect(isLegacyDefaultName(l)).toBe(true);
    }
  });

  it('ne confond pas un nom personnel avec un nom par défaut', () => {
    for (const l of ['Portefeuille de Marie', 'Compte pro', 'Main wallet', 'Épargne', 'Portefeuille']) {
      expect(isLegacyDefaultName(l)).toBe(false);
    }
  });

  it('un libellé hérité est traduit comme un défaut', () => {
    // C'est tout l'intérêt : l'anglophone qui avait « Portefeuille principal »
    // en stockage voit enfin « Main wallet ».
    expect(walletDisplayName(w('Portefeuille principal'), 0, t(EN))).toBe('Main wallet');
    expect(accountDisplayName({ index: 1, label: 'Compte 2' }, t(EN))).toBe('Account 2');
  });
});
