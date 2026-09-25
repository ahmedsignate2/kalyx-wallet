jest.mock('./walletStore', () => ({ useWallet: { getState: () => ({ account: null }) } }));

import { buildCollectUrl, requiredCollectFields, isPayAvailable } from './walletconnectPay';

describe('buildCollectUrl', () => {
  const BASE = 'https://pay.walletconnect.com/ic/abc';

  it('sans option, l\'URL est rendue telle quelle', () => {
    expect(buildCollectUrl(BASE)).toBe(BASE);
    expect(buildCollectUrl(BASE, {})).toBe(BASE);
    expect(buildCollectUrl(BASE, { prefill: {} })).toBe(BASE);
  });

  it('préserve une requête déjà présente', () => {
    // Écraser la requête du service casserait le lien : elle porte le contexte
    // de l'option choisie.
    expect(buildCollectUrl(`${BASE}?session=1`, { theme: 'dark' })).toBe(`${BASE}?session=1&theme=dark`);
    expect(buildCollectUrl(BASE, { theme: 'dark' })).toBe(`${BASE}?theme=dark`);
  });

  it('encode le préremplissage en base64url, sans remplissage', () => {
    const url = buildCollectUrl(BASE, { prefill: { fullName: 'Ada Lovelace' } });
    const value = new URL(url).searchParams.get('prefill')!;
    // base64url : ni `+`, ni `/`, ni `=`.
    expect(value).not.toMatch(/[+/=]/);
    const b64 = value.replace(/-/g, '+').replace(/_/g, '/');
    expect(JSON.parse(Buffer.from(b64, 'base64').toString('utf8'))).toEqual({ fullName: 'Ada Lovelace' });
  });

  it('les variables de thème partent VERBATIM', () => {
    // Elles sont exportées déjà encodées depuis le tableau de bord ; les
    // ré-encoder les rendrait illisibles.
    const tv = 'eyJmb250IjoiSW50ZXIifQ';
    expect(buildCollectUrl(BASE, { themeVariables: tv })).toContain(`themeVariables=${tv}`);
  });

  it('combine les trois paramètres', () => {
    const url = buildCollectUrl(BASE, { prefill: { dob: '1990-01-15' }, theme: 'light', themeVariables: 'abc' });
    expect(url).toMatch(/prefill=/);
    expect(url).toContain('theme=light');
    expect(url).toContain('themeVariables=abc');
  });
});

describe('requiredCollectFields', () => {
  it('lit la liste `required` du schéma', () => {
    // Le schéma arrive en CHAÎNE, pas en objet : l'oublier ferait lire
    // `undefined` et ne rien préremplir, sans erreur visible.
    const schema = JSON.stringify({ type: 'object', required: ['fullName', 'dob', 'pobAddress'] });
    expect(requiredCollectFields(schema)).toEqual(['fullName', 'dob', 'pobAddress']);
  });

  it('rien du tout sur un schéma absent, illisible ou sans `required`', () => {
    expect(requiredCollectFields(undefined)).toEqual([]);
    expect(requiredCollectFields('pas du json')).toEqual([]);
    expect(requiredCollectFields('{"type":"object"}')).toEqual([]);
    expect(requiredCollectFields('{"required":"pas un tableau"}')).toEqual([]);
  });

  it('ignore les entrées qui ne sont pas des chaînes', () => {
    expect(requiredCollectFields('{"required":["a",1,null,"b"]}')).toEqual(['a', 'b']);
  });
});

describe('isPayAvailable', () => {
  it('faux sans module natif : le paiement se retire au lieu d\'échouer', () => {
    /*
     * Le SDK repose sur un module natif (Yttrium) qu'aucune mise à jour OTA ne
     * peut apporter. Sur une installation antérieure au build qui l'embarque,
     * la fonction doit simplement ne pas se proposer — pas faire tomber l'app
     * au démarrage, comme le ferait un import statique.
     */
    expect(isPayAvailable()).toBe(false);
  });
});
