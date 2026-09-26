jest.mock('./walletStore', () => ({ useWallet: { getState: () => ({ account: null }) } }));

import { buildCollectUrl, requiredCollectFields, isPayAvailable, payAmountText } from './walletconnectPay';

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

describe('payAmountText', () => {
  const amount = (value: string, decimals: number, assetSymbol = 'USD') => ({
    unit: `iso4217/${assetSymbol}`,
    value,
    display: { assetSymbol, assetName: assetSymbol, decimals },
  });

  /*
   * LE DÉFAUT QU'ON VERROUILLE. `value` est en unités minimales : ma trace
   * affichait « 1 USD » pour une demande de 0,01 USD, soit cent fois trop. Un
   * diagnostic faux d'un facteur cent fait chercher le problème ailleurs — et
   * c'est exactement ce qui s'est produit.
   */
  it('applique les décimales au lieu de rendre les unités minimales', () => {
    expect(payAmountText(amount('1', 2))).toBe('0.01 USD');
    expect(payAmountText(amount('100', 2))).toBe('1 USD');
    expect(payAmountText(amount('170000', 6, 'USDC'))).toBe('0.17 USDC');
  });

  it('sans décimales, la valeur reste entière', () => {
    expect(payAmountText(amount('42', 0))).toBe('42 USD');
  });

  it('rien à afficher sans montant', () => {
    expect(payAmountText(undefined)).toBeNull();
  });

  /*
   * Une valeur que le service enverrait hors format ne doit pas faire tomber
   * l'écran de diagnostic : c'est le seul endroit où l'on peut encore
   * comprendre ce qui se passe.
   */
  it('une valeur non numérique est rendue telle quelle, sans lever', () => {
    expect(payAmountText(amount('abc', 2))).toBe('abc USD');
  });
});

describe('buildCollectUrl — thème du tableau de bord', () => {
  /*
   * `themeVariables` est déjà encodé en base64url par le tableau de bord : il
   * doit partir VERBATIM. Le réencoder produirait un paramètre que le formulaire
   * ignore, et le thème passerait à la trappe sans rien signaler.
   */
  const EXPORTED =
    'eyJmb250RmFtaWx5IjoicG9wcGlucyIsImZvbnRTaXplIjoxNSwiaW5wdXRSYWRpdXMiOjI0LCJidXR0b25SYWRpdXMiOjI0fQ';

  it('la valeur exportée part telle quelle', () => {
    const url = buildCollectUrl('https://pay.walletconnect.com/collect/?pid=x', {
      themeVariables: EXPORTED,
    });
    expect(url).toContain(`themeVariables=${EXPORTED}`);
    // Ni réencodée, ni tronquée du remplissage qu'elle n'a pas.
    expect(url).not.toContain('%3D');
  });

  it('le mode et le thème coexistent sur une URL qui a déjà une requête', () => {
    const url = buildCollectUrl('https://pay.walletconnect.com/collect/?pid=x&accounts=y', {
      theme: 'dark',
      themeVariables: EXPORTED,
    });
    expect(url).toContain('?pid=x&accounts=y&');
    expect(url).toContain('theme=dark');
    expect(url).toContain(`themeVariables=${EXPORTED}`);
  });
});
