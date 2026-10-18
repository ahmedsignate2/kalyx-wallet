import { shouldClosePending } from './dappPending';

describe('fenêtre de demande dApp', () => {
  const p = { id: 7, tabId: 'a' };
  it('connexion libérée avant la fin : la fenêtre se ferme quand même (plus de boucle Face ID)', () => {
    expect(shouldClosePending(null, p)).toBe(true);
  });
  it('même demande : fermée', () => {
    expect(shouldClosePending({ id: 7, tabId: 'a' }, p)).toBe(true);
  });
  it('une AUTRE demande arrivée entre-temps : laissée ouverte', () => {
    expect(shouldClosePending({ id: 8, tabId: 'a' }, p)).toBe(false);
    expect(shouldClosePending({ id: 7, tabId: 'b' }, p)).toBe(false);
  });
});
