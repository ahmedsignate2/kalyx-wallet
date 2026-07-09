import { alertTriggered } from './priceAlerts';

describe('alertTriggered', () => {
  it('above : déclenche quand le prix atteint/dépasse le seuil', () => {
    expect(alertTriggered({ direction: 'above', target: 3000 }, 3000)).toBe(true);
    expect(alertTriggered({ direction: 'above', target: 3000 }, 3200)).toBe(true);
    expect(alertTriggered({ direction: 'above', target: 3000 }, 2999)).toBe(false);
  });
  it('below : déclenche quand le prix atteint/passe sous le seuil', () => {
    expect(alertTriggered({ direction: 'below', target: 2000 }, 2000)).toBe(true);
    expect(alertTriggered({ direction: 'below', target: 2000 }, 1800)).toBe(true);
    expect(alertTriggered({ direction: 'below', target: 2000 }, 2100)).toBe(false);
  });
  it('ignore les prix invalides', () => {
    expect(alertTriggered({ direction: 'below', target: 2000 }, 0)).toBe(false);
    expect(alertTriggered({ direction: 'below', target: 2000 }, NaN)).toBe(false);
  });
});
