/**
 * Garde-fou de la table code → traduction.
 *
 * Elle est facile à laisser pourrir : un code ajouté au domaine ne casse rien
 * visiblement, il se contente de faire ressortir la phrase française du domaine
 * dans toutes les langues — exactement le défaut qu'on vient de corriger. Ce test
 * le fait échouer à la place.
 */
import { friendlyTxError } from './txError';
import { WalletError } from '../src';

/** Codes du domaine, lus dans la source : impossible d'en oublier un. */
const CODES = (() => {
  const src = require('fs').readFileSync(require('path').join(__dirname, '../src/domain/errors.ts'), 'utf8') as string;
  const block = src.slice(src.indexOf('export type WalletErrorCode'), src.indexOf(';', src.indexOf('export type WalletErrorCode')));
  return [...block.matchAll(/'([A-Z_]+)'/g)].map((m) => m[1]);
})();

describe('friendlyTxError — tous les codes du portefeuille sont traduits', () => {
  it('la liste des codes est bien lue', () => {
    expect(CODES.length).toBeGreaterThan(10);
    expect(CODES).toContain('WRONG_PIN');
    expect(CODES).toContain('TX_FAILED');
  });

  /*
   * Le traducteur de test rend la CLÉ : si un code n'est pas mappé, on récupère
   * la phrase française du domaine au lieu d'une clé, et le test le voit.
   */
  const t = (key: string) => key;

  it.each(CODES)('le code %s produit une clé de traduction, pas une phrase', (code) => {
    const message = friendlyTxError(new WalletError(code as never, 'Phrase française du domaine'), t as never);
    /*
     * `INVALID_KEY` est volontairement traité à part : son message porte un
     * sous-code `import.*`, parce que six situations distinctes s'y cachent et
     * qu'une phrase unique n'aiderait personne.
     */
    if (code === 'INVALID_KEY') {
      expect(message).toBe('keyErrUnrecognised');
      return;
    }
    expect(message).toMatch(/^[a-z][A-Za-z]+$/);
    expect(message).not.toContain('française');
  });

  it('sans traducteur, la phrase du domaine reste le repli', () => {
    const message = friendlyTxError(new WalletError('NOT_SUPPORTED', 'Détail technique précis'));
    expect(message).toBe('Détail technique précis');
  });
});
