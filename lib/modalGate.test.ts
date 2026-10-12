import { modalDismissed, modalHasTurn, requestModal, resetModalGateForTests, RELEASE_FALLBACK_MS, subscribeModalGate, withdrawModal } from './modalGate';

beforeEach(() => {
  jest.useFakeTimers();
  resetModalGateForTests();
});
afterEach(() => jest.useRealTimers());

describe('file des fenêtres iOS', () => {
  it('une fenêtre seule s’affiche tout de suite', () => {
    requestModal('a');
    expect(modalHasTurn('a')).toBe(true);
  });

  it('« Signer » : la demande se ferme, la confirmation attend la FIN de la fermeture', () => {
    requestModal('sign');
    withdrawModal('sign');
    requestModal('pin');
    expect(modalHasTurn('sign')).toBe(false);
    expect(modalHasTurn('pin')).toBe(false); // présentée maintenant, iOS l'ignorerait
    modalDismissed('sign');
    expect(modalHasTurn('pin')).toBe(true);
  });

  it('délai de secours si onDismiss ne vient pas (fenêtre démontée)', () => {
    requestModal('confirm');
    requestModal('success');
    withdrawModal('confirm');
    expect(modalHasTurn('success')).toBe(false);
    jest.advanceTimersByTime(RELEASE_FALLBACK_MS);
    expect(modalHasTurn('success')).toBe(true);
  });

  it('« Annuler » : la confirmation se ferme, la demande d’origine revient', () => {
    requestModal('sign');
    withdrawModal('sign');
    requestModal('pin');
    modalDismissed('sign');
    withdrawModal('pin');
    requestModal('sign');
    modalDismissed('pin');
    expect(modalHasTurn('sign')).toBe(true);
  });

  it('rouverte pendant sa propre fermeture : elle garde la place', () => {
    requestModal('a');
    withdrawModal('a');
    requestModal('b');
    requestModal('a');
    expect(modalHasTurn('a')).toBe(false); // pas pendant l'animation de fermeture
    modalDismissed('a');
    expect(modalHasTurn('a')).toBe(true);
    expect(modalHasTurn('b')).toBe(false);
    jest.advanceTimersByTime(RELEASE_FALLBACK_MS * 2);
    expect(modalHasTurn('a')).toBe(true);
  });

  it('une fenêtre retirée de la file avant son tour ne bloque rien', () => {
    requestModal('a');
    requestModal('b');
    withdrawModal('b');
    requestModal('c');
    withdrawModal('a');
    modalDismissed('a');
    expect(modalHasTurn('c')).toBe(true);
  });

  it('prévient les abonnés quand le tour change', () => {
    const seen: boolean[] = [];
    subscribeModalGate(() => seen.push(modalHasTurn('b')));
    requestModal('a');
    requestModal('b');
    withdrawModal('a');
    modalDismissed('a');
    expect(seen[seen.length - 1]).toBe(true);
  });
});
