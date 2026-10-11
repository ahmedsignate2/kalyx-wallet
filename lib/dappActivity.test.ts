jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => {}),
  multiRemove: jest.fn(async () => {}),
}));
import { knownSites, useDappActivity } from './dappActivity';

describe('Sites connectés', () => {
  it('fusionne connexions et sites mémorisés, sans doublon', () => {
    const list = knownSites(
      [{ host: 'a.io', url: 'https://a.io', title: 'A', at: 2 }, { host: 'b.io', url: 'https://b.io', title: '', at: 5 }],
      ['a.io', 'c.io'],
      [{ host: 'a.io', kind: 'tx', at: 9 }],
    );
    expect(list.map((s) => s.host)).toEqual(['b.io', 'a.io', 'c.io']);
    expect(list.find((s) => s.host === 'a.io')).toMatchObject({ remembered: true, lastSignatureAt: 9 });
    expect(list.find((s) => s.host === 'b.io')).toMatchObject({ remembered: false, title: 'b.io' });
    expect(list.find((s) => s.host === 'c.io')).toMatchObject({ remembered: true, url: 'https://c.io' });
  });

  it('oublier un site : retiré des connexions ET de la mémoire, révocation émise', () => {
    const st = useDappActivity.getState();
    st.addConnection({ host: 'x.io', url: 'https://x.io', title: 'X' });
    st.remember('x.io');
    expect(useDappActivity.getState().isRemembered('x.io')).toBe(true);
    useDappActivity.getState().removeConnection('x.io');
    const after = useDappActivity.getState();
    expect(after.isRemembered('x.io')).toBe(false);
    expect(after.connections.some((c) => c.host === 'x.io')).toBe(false);
    expect(after.revoked?.hosts).toEqual(['x.io']);
  });

  it("« tout oublier » révoque TOUS les hôtes en un seul signal (pas seulement le dernier)", () => {
    const st = useDappActivity.getState();
    for (const h of ['a.io', 'b.io', 'c.io']) {
      st.addConnection({ host: h, url: `https://${h}`, title: h });
      st.remember(h);
    }
    const before = useDappActivity.getState().revoked?.n ?? 0;
    useDappActivity.getState().removeConnections(['a.io', 'b.io', 'c.io']);
    const after = useDappActivity.getState();
    expect([...(after.revoked?.hosts ?? [])].sort()).toEqual(['a.io', 'b.io', 'c.io']);
    expect(after.revoked?.n).toBe(before + 1);
    expect(['a.io', 'b.io', 'c.io'].some((h) => after.isRemembered(h))).toBe(false);
  });
});
