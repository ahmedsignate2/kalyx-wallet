import { shouldAutoLock } from './autoLockPolicy';

const base = { autoLockMinutes: 3, pathname: '/home' };

describe('shouldAutoLock', () => {
  it('verrouille après le délai', () => {
    expect(shouldAutoLock({ ...base, wallElapsedMs: 3 * 60_000, monoElapsedMs: 3 * 60_000 })).toBe(true);
    expect(shouldAutoLock({ ...base, wallElapsedMs: 60_000, monoElapsedMs: 60_000 })).toBe(false);
  });

  it("verrouille si l'heure a reculé pendant l'absence", () => {
    expect(shouldAutoLock({ ...base, wallElapsedMs: -9 * 60_000, monoElapsedMs: 10_000 })).toBe(true);
  });

  it("verrouille si l'heure murale avance nettement moins que la monotone", () => {
    expect(shouldAutoLock({ ...base, wallElapsedMs: 30_000, monoElapsedMs: 90_000 })).toBe(true);
  });

  it('se fie à la plus grande des deux mesures (veille profonde)', () => {
    expect(shouldAutoLock({ ...base, wallElapsedMs: 5 * 60_000, monoElapsedMs: 20_000 })).toBe(true);
  });

  it('« Jamais » ne verrouille pas, sauf sur un écran qui affiche un secret', () => {
    expect(shouldAutoLock({ ...base, autoLockMinutes: -1, wallElapsedMs: 3_600_000, monoElapsedMs: 3_600_000 })).toBe(false);
    expect(shouldAutoLock({ autoLockMinutes: -1, pathname: '/reveal-phrase', wallElapsedMs: 1, monoElapsedMs: 1 })).toBe(true);
  });
});
