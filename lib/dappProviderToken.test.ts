import { buildInjectedProvider, parseDappMessage } from './dappProvider';

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
