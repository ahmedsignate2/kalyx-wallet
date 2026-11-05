import { buildConnectLinkScanner, parseConnectLinkMessage } from './connectLinkScanner';

const wc = `wc:${'a'.repeat(64)}@2?relay-protocol=irn&symKey=${'b'.repeat(64)}`;

describe('QR de connexion affiché par la page', () => {
  it('le script est valide et porte le jeton de la page', () => {
    const js = buildConnectLinkScanner('tok');
    expect(() => new Function(js)).not.toThrow();
    expect(js).toContain('"tok"');
  });
  it('accepte le message de la page, avec son jeton seulement', () => {
    const msg = JSON.stringify({ __kalyxLink: 1, link: wc, k: 'tok' });
    expect(parseConnectLinkMessage(msg, 'tok')).toBe(wc);
    expect(parseConnectLinkMessage(msg, 'autre')).toBeNull();
    expect(parseConnectLinkMessage(msg, '')).toBeNull();
    expect(parseConnectLinkMessage(JSON.stringify({ __kalyxLink: 1, link: 'x'.repeat(9000), k: 'tok' }), 'tok')).toBeNull();
    expect(parseConnectLinkMessage(JSON.stringify({ id: 1, method: 'eth_accounts', k: 'tok' }), 'tok')).toBeNull();
    expect(parseConnectLinkMessage('pas du json', 'tok')).toBeNull();
  });
});
