import { addEntry, checkRecipient, enable, EMPTY_WHITELIST, isEnforced, isTrustedWallet, noteWallet, parseWhitelist, removeEntry, requestDisable, settle, WHITELIST_DELAY_MS as D } from './whitelist';

const key = (a: string) => a.toLowerCase();
const notOwn = () => false;

describe('liste blanche', () => {
  it('éteinte : tout passe ; allumée : seulement la liste, après 24 h', () => {
    expect(checkRecipient(EMPTY_WHITELIST, '0xA', 0, key, notOwn)).toEqual({ kind: 'allowed' });
    let s = enable(EMPTY_WHITELIST);
    expect(checkRecipient(s, '0xA', 0, key, notOwn)).toEqual({ kind: 'blocked' });
    s = addEntry(s, '0xA', 'Ami', 1_000, key);
    expect(checkRecipient(s, '0xa', 1_000 + D - 1, key, notOwn)).toEqual({ kind: 'pending', activeAt: 1_000 + D });
    expect(checkRecipient(s, '0xa', 1_000 + D, key, notOwn)).toEqual({ kind: 'allowed' });
  });
  it('ajout avant activation : utilisable tout de suite ; ses propres comptes passent toujours', () => {
    const s = enable(addEntry(EMPTY_WHITELIST, '0xA', '', 5, key));
    expect(checkRecipient(s, '0xA', 5, key, notOwn)).toEqual({ kind: 'allowed' });
    expect(checkRecipient(s, '0xMe', 5, key, (a) => a === '0xMe')).toEqual({ kind: 'allowed' });
  });
  it('heure inconnue : rien de différé ne s’active, la protection reste en vigueur', () => {
    let s = addEntry(enable(EMPTY_WHITELIST), '0xA', '', 0, key);
    expect(checkRecipient(s, '0xA', null, key, notOwn).kind).toBe('pending');
    s = requestDisable(s, 0);
    expect(isEnforced(s, null)).toBe(true);
  });
  it('désactivation différée de 24 h ; annulable en réactivant ; retrait immédiat', () => {
    let s = requestDisable(addEntry(EMPTY_WHITELIST, '0xA', '', 0, key), 0); // éteinte : sans effet
    expect(s.disableAt).toBeNull();
    s = requestDisable(enable(s), 10);
    expect(isEnforced(s, 10 + D - 1)).toBe(true);
    expect(isEnforced(s, 10 + D)).toBe(false);
    expect(settle(s, 10 + D).enabled).toBe(false);
    expect(enable(s).disableAt).toBeNull();
    expect(removeEntry(s, '0xa', key).entries).toEqual([]);
  });
  it('fichier illisible : considérée ACTIVE et vide (jamais éteinte en silence)', () => {
    expect(parseWhitelist('{oops')).toEqual({ enabled: true, entries: [], trusted: [], disableAt: null });
    expect(parseWhitelist(null)).toEqual(EMPTY_WHITELIST);
  });
});

describe('portefeuilles de confiance', () => {
  it('présents à l’activation : tout de suite ; créés ou importés ensuite : après 24 h', () => {
    let s = enable(EMPTY_WHITELIST, ['a']);
    expect(isTrustedWallet(s, 'a', null)).toBe(true);
    s = noteWallet(s, 'thief', 100);
    expect(isTrustedWallet(s, 'thief', 100 + D - 1)).toBe(false);
    expect(isTrustedWallet(s, 'thief', 100 + D)).toBe(true);
    expect(noteWallet(s, 'x', null)).toBe(s); // heure inconnue : pas de confiance
  });
  it('ajout quand la protection est éteinte : sans heure, utilisable dès l’activation', () => {
    const s = enable(addEntry(EMPTY_WHITELIST, '0xA', '', null, key));
    expect(checkRecipient(s, '0xA', null, key, notOwn)).toEqual({ kind: 'allowed' });
  });
});

