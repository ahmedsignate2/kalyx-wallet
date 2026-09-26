import { decideNoOption, needsCollect, preselectOption } from './payFlow';

describe('decideNoOption', () => {
  it('formulaire exigé, première réponse : on le présente', () => {
    expect(decideNoOption({ rootCollectUrl: 'https://x/form', afterInfo: false })).toEqual({
      kind: 'collect',
      url: 'https://x/form',
    });
  });

  /*
   * LA BOUCLE. Le service renvoie `collectData` à chaque réponse : le champ
   * décrit ce que le paiement requiert, il ne dit pas que ça manque encore.
   * Après l'envoi du formulaire, sa présence ne doit plus rien déclencher —
   * sinon l'utilisateur ressaisit indéfiniment ce qu'il vient de saisir.
   */
  it('même formulaire redemandé après envoi : on s’arrête, on ne boucle pas', () => {
    expect(decideNoOption({ rootCollectUrl: 'https://x/form', afterInfo: true })).toEqual({
      kind: 'stop',
      reason: 'INFO_NOT_ENOUGH',
    });
  });

  it('aucun formulaire exigé : rien pour payer, et on le dit', () => {
    expect(decideNoOption({ rootCollectUrl: undefined, afterInfo: false })).toEqual({
      kind: 'stop',
      reason: 'NO_OPTION',
    });
    expect(decideNoOption({ rootCollectUrl: null, afterInfo: false })).toEqual({
      kind: 'stop',
      reason: 'NO_OPTION',
    });
  });

  /** Une URL vide ou blanche n'est pas un formulaire : l'ouvrir montrerait du vide. */
  it('URL vide ou blanche : traitée comme absente', () => {
    expect(decideNoOption({ rootCollectUrl: '', afterInfo: false })).toEqual({
      kind: 'stop',
      reason: 'NO_OPTION',
    });
    expect(decideNoOption({ rootCollectUrl: '   ', afterInfo: false })).toEqual({
      kind: 'stop',
      reason: 'NO_OPTION',
    });
  });

  /*
   * La sortie est BORNÉE : quel que soit l'état d'entrée, `afterInfo` à vrai ne
   * peut plus produire de `collect`. C'est la propriété qui garantit l'absence
   * de boucle, plus sûrement qu'un cas d'exemple.
   */
  it('après envoi, aucune entrée ne peut produire une nouvelle capture', () => {
    for (const url of [undefined, null, '', '  ', 'https://x/form', 'https://y/other']) {
      expect(decideNoOption({ rootCollectUrl: url, afterInfo: true }).kind).toBe('stop');
    }
  });
});

describe('needsCollect', () => {
  const plain = { id: 'a' };
  const withForm = { id: 'b', collectData: { url: 'https://x/form' } };

  it('une option sans formulaire ne réclame rien', () => {
    expect(needsCollect(plain, [])).toBe(false);
    expect(needsCollect({ id: 'c', collectData: null }, [])).toBe(false);
    expect(needsCollect({ id: 'd', collectData: {} }, [])).toBe(false);
  });

  it('une option avec formulaire le réclame, une fois', () => {
    expect(needsCollect(withForm, [])).toBe(true);
    expect(needsCollect(withForm, ['b'])).toBe(false);
  });

  /*
   * LE DÉFAUT CORRIGÉ. Le service renvoie `collectData` à l'identique après
   * l'envoi : s'y fier seul laissait le badge affiché pour toujours et
   * rouvrait le formulaire dès qu'on retouchait l'option.
   */
  it('la mémoire de l’app prime sur ce que le service répète', () => {
    expect(needsCollect(withForm, ['a', 'b', 'c'])).toBe(false);
  });

  it('rien à réclamer sans option', () => {
    expect(needsCollect(null, [])).toBe(false);
    expect(needsCollect(undefined, [])).toBe(false);
  });
});

describe('preselectOption', () => {
  const plain = { id: 'a' };
  const withForm = { id: 'b', collectData: { url: 'https://x/form' } };

  it('retient la première option qui ne réclame rien', () => {
    expect(preselectOption([withForm, plain])).toEqual(plain);
  });

  it('retient une option déjà renseignée', () => {
    expect(preselectOption([withForm], ['b'])).toEqual(withForm);
  });

  /*
   * Présélectionner une option qui exige des informations ouvrirait un
   * formulaire que l'utilisateur n'a pas demandé.
   */
  it('ne présélectionne rien quand toutes réclament des informations', () => {
    expect(preselectOption([withForm])).toBeNull();
  });

  it('rien à présélectionner dans une liste vide', () => {
    expect(preselectOption([])).toBeNull();
  });
});
