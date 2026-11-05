import { buildInjectedProvider, parseDappAck, parseDappMessage } from './dappProvider';

describe('Fournisseur EVM injecté : jeton de page', () => {
  it('accepte le message portant le jeton, refuse celui d’une iframe', () => {
    const js = buildInjectedProvider('0x1', 'abc123');
    expect(js).toContain('"abc123"');
    const ok = JSON.stringify({ id: 1, method: 'eth_requestAccounts', params: [], k: 'abc123' });
    expect(parseDappMessage(ok, 'abc123')).toMatchObject({ id: 1, method: 'eth_requestAccounts' });
    expect(parseDappMessage(JSON.stringify({ id: 1, method: 'eth_sendTransaction', params: [] }), 'abc123')).toBeNull();
    expect(parseDappMessage(ok, 'autre')).toBeNull();
    expect(parseDappMessage(ok, '')).toBeNull();
  });
});

describe('Accusé de réception d’une réponse (connexion sans rafraîchir)', () => {
  it('la page confirme la réponse reçue, avec son jeton ; rien pour une demande inconnue', async () => {
    const posted: any[] = [];
    const win: any = { addEventListener: () => {}, dispatchEvent: () => {}, ReactNativeWebView: { postMessage: (m: string) => posted.push(JSON.parse(m)) } };
    class CE { constructor(public type: string, public o: any) {} }
    new Function('window', 'CustomEvent', buildInjectedProvider('0x1', 'tok'))(win, CE);
    const p = win.ethereum.request({ method: 'eth_requestAccounts' });
    win.__kalyxResolve(posted[0].id, ['0x0000000000000000000000000000000000000001'], null);
    await expect(p).resolves.toEqual(['0x0000000000000000000000000000000000000001']);
    expect(parseDappAck(JSON.stringify(posted[1]), 'tok')).toBe(posted[0].id);
    win.__kalyxResolve(999, [], null); // demande inconnue : pas d'accusé
    expect(posted).toHaveLength(2);
  });
  it('refuse un accusé sans le bon jeton, et n’en voit pas dans une demande', () => {
    expect(parseDappAck(JSON.stringify({ __kalyxAck: 1, id: 3, k: 'x' }), 'tok')).toBeNull();
    expect(parseDappAck(JSON.stringify({ __kalyxAck: 1, id: 3, k: 'tok' }), '')).toBeNull();
    expect(parseDappAck(JSON.stringify({ id: 3, method: 'eth_accounts', k: 'tok' }), 'tok')).toBeNull();
    expect(parseDappMessage(JSON.stringify({ __kalyxAck: 1, id: 3, k: 'tok' }), 'tok')).toBeNull();
    expect(parseDappAck('pas du json', 'tok')).toBeNull();
  });
});
