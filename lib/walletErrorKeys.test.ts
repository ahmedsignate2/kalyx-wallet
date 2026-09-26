/**
 * Garde-fou de la table code → traduction.
 *
 * Elle est facile à laisser pourrir : un code ajouté au domaine ne casse rien
 * visiblement, il se contente de faire ressortir la phrase française du domaine
 * dans toutes les langues — exactement le défaut qu'on vient de corriger. Ce test
 * le fait échouer à la place.
 */
import { UserFacingError, friendlyTxError } from './txError';
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

describe('friendlyTxError — aucune fuite de langue', () => {
  const t = (key: string) => `T:${key}`;

  /*
   * LA FUITE SUPPRIMÉE. Une liste blanche renvoyait certains messages français
   * TELS QUELS, dans les quinze langues — le commentaire l'assumait, et ça ne
   * marchait qu'en français.
   */
  it('un message français rédigé à la main ne ressort plus tel quel', () => {
    for (const m of [
      'Solde insuffisant pour couvrir le montant',
      'Simulation refusée par le réseau',
      'Diffusion refusée par le réseau Solana',
      'Confirmation non reçue',
      'L’autorisation a expiré',
    ]) {
      const out = friendlyTxError(new Error(m), t as never);
      expect(out).toBe('T:errGenericTxFail');
      expect(out).not.toContain('Solde');
      expect(out).not.toContain('refusée');
    }
  });

  /*
   * Le repli accolait cinquante caractères du message BRUT à la phrase traduite —
   * souvent du français, parfois un fragment de JSON-RPC. Le détail vit dans le
   * journal technique, pas à l'écran.
   */
  it('le repli générique ne colle plus un extrait du message brut', () => {
    const out = friendlyTxError(new Error('quelque chose d’imprévu côté serveur'), t as never);
    expect(out).toBe('T:errGenericTxFail');
    expect(out).not.toContain('imprévu');
  });

  /** Les cas reconnus gardent leur message précis, traduit. */
  it('un cas reconnu reste précis', () => {
    expect(friendlyTxError(new Error('insufficient funds for gas'), t as never)).toBe('T:errInsufficientFunds');
    expect(friendlyTxError(new Error('user rejected the request'), t as never)).toBe('T:errUserRejected');
  });
});

/**
 * L'autre bout du même problème : une phrase que l'interface a DÉJÀ traduite ne
 * doit pas repasser par les devinettes. Le tableau de bord web levait des
 * `Error` nues portant ses diagnostics, et la version anglaise de « the approval
 * is confirmed but not yet visible on the network » tombait sur `network` — donc
 * on affichait « réseau indisponible, vérifie ta connexion », faux. En français
 * la même erreur ne matchait rien et devenait le message générique : l'utilisateur
 * voyait un message différent selon sa langue.
 */
describe('friendlyTxError — les messages déjà traduits passent intacts', () => {
  const t = (key: string) => `T:${key}`;

  it('rend le message tel quel, sans le soumettre aux devinettes', () => {
    const m = 'The approval is confirmed but not yet visible on the network. Try again in a few seconds.';
    expect(friendlyTxError(new UserFacingError(m), t as never)).toBe(m);
  });

  it('ne se laisse pas réécrire par un mot-clé contenu dans la phrase', () => {
    // Chacune contient un mot que les heuristiques cherchent (network, rejected,
    // nonce, slippage) : aucune ne doit être détournée.
    for (const m of [
      'Le téléphone n’a pas renvoyé de transaction signée.',
      'Network fee could not be read — try again.',
      'The phone rejected nothing: it never answered.',
      'Nonce introuvable côté téléphone.',
      'Slippage setting unavailable on this route.',
    ]) {
      expect(friendlyTxError(new UserFacingError(m), t as never)).toBe(m);
    }
  });

  it('une Error nue portant la même phrase reste, elle, traduite par code', () => {
    // La distinction est déclarée par celui qui lève, jamais devinée.
    expect(friendlyTxError(new Error('Nonce introuvable côté téléphone.'), t as never)).toBe('T:errNonce');
  });
});
