import { decoyMayWrite, isDecoySession, onDecoyChange, setDecoySession } from './sessionMode';

describe('pare-feu de la session leurre', () => {
  it('hors leurre tout s’écrit ; en leurre, seules les clés du leurre', () => {
    expect(decoyMayWrite('nova.contacts')).toBe(true);
    const seen: boolean[] = [];
    const off = onDecoyChange((on) => seen.push(on));
    setDecoySession(true, ['duress-abc']);
    expect(isDecoySession()).toBe(true);
    expect(decoyMayWrite('nova.vault.duress-abc')).toBe(true);
    expect(decoyMayWrite('nova.accounts.duress-abc')).toBe(true);
    expect(decoyMayWrite('kalyx.duress')).toBe(true);
    expect(decoyMayWrite('nova.vault')).toBe(false); // vrai coffre « primary »
    expect(decoyMayWrite('nova.wallets')).toBe(false);
    expect(decoyMayWrite('kalyx.whitelist')).toBe(false);
    setDecoySession(false);
    expect(decoyMayWrite('nova.wallets')).toBe(true);
    expect(seen).toEqual([true, false]);
    off();
  });
});
