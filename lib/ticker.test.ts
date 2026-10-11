import { createTicker } from './ticker';

describe('createTicker', () => {
  it('notifie les abonnés à chaque changement de valeur, pas à valeur égale', () => {
    const t = createTicker(5);
    const seen: number[] = [];
    const off = t.subscribe(() => seen.push(t.get()));
    t.set(4);
    t.set(4);
    t.set(3);
    off();
    t.set(2);
    expect(seen).toEqual([4, 3]);
    expect(t.get()).toBe(2);
  });
});
