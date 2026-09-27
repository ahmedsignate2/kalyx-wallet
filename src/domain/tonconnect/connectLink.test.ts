import V from './connect-link-vectors.json';
import { bridgeForLink, looksLikeTonConnect, manifestDomain, parseConnectLink, parseManifest, DEFAULT_BRIDGE } from './connectLink';

/* Liens produits par le code de @tonconnect/sdk 4.0.2, copié tel quel. */
describe('liens de connexion réels', () => {
  it.each([
    ['Tonkeeper', V.tonkeeper, 'https://bridge.tonapi.io/bridge'],
    ['MyTonWallet', V.mytonwallet, 'https://tonconnectbridge.mytonwallet.org/bridge'],
    ['Telegram Wallet', V.telegram, 'https://walletbot.me/tonconnect-bridge/bridge'],
    ['tc://', V.tc, DEFAULT_BRIDGE],
  ])('%s : requête intacte, bon pont', (_n, link, bridge) => {
    expect(looksLikeTonConnect(link)).toBe(true);
    const p = parseConnectLink(link)!;
    expect(p.clientId).toBe(V.id);
    expect(p.request).toEqual(V.message);
    expect(p.bridge).toBe(bridge);
  });

  it('le payload de ton_proof survit aux réencodages (points, tirets, =)', () => {
    const p = parseConnectLink(V.telegram)!;
    expect(p.request.items[1]).toEqual({ name: 'ton_proof', payload: 'a1b2c3-nonce_with.dots-and=eq' });
  });

  it('refuse ce qui n’est pas une demande valide', () => {
    expect(parseConnectLink('https://example.com')).toBeNull();
    expect(parseConnectLink(V.tonkeeper.replace('v=2', 'v=1'))).toBeNull();
    expect(parseConnectLink(V.tonkeeper.replace(V.id, 'zz'))).toBeNull();
    const noAddr = V.tonkeeper.replace(encodeURIComponent('{"name":"ton_addr"},'), '');
    expect(parseConnectLink(noAddr)).toBeNull();
    const http = V.tonkeeper.replace(encodeURIComponent('https://app.ston.fi'), encodeURIComponent('http://app.ston.fi'));
    expect(parseConnectLink(http)).toBeNull();
    expect(parseConnectLink('wc:abc@2?relay-protocol=irn')).toBeNull();
  });

  it('lien inconnu : pont de TonAPI', () => {
    expect(bridgeForLink('https://unknown.example/ton-connect?v=2')).toBe(DEFAULT_BRIDGE);
  });
});

describe('manifeste', () => {
  it('garde le domaine signé et affiché', () => {
    const m = parseManifest({ url: 'https://app.ston.fi', name: 'STON.fi', iconUrl: 'https://static.ston.fi/logo.png' })!;
    expect(manifestDomain(m)).toBe('app.ston.fi');
  });

  it('refuse http, un domaine sans point (réservé aux wallets) et un nom absent', () => {
    expect(parseManifest({ url: 'http://app.ston.fi', name: 'x' })).toBeNull();
    expect(parseManifest({ url: 'https://tonkeeper', name: 'x' })).toBeNull();
    expect(parseManifest({ url: 'https://app.ston.fi' })).toBeNull();
    expect(parseManifest({ url: 'https://a.b', name: 'x', iconUrl: 'javascript:alert(1)' })!.iconUrl).toBe('');
  });
});

describe('anti-hameçonnage', () => {
  const { manifestOriginMatches } = require('./connectLink');
  const ston = { url: 'https://app.ston.fi', name: 'STON.fi', iconUrl: '' };
  it('accepte un manifeste hébergé sur son propre domaine', () => {
    expect(manifestOriginMatches('https://app.ston.fi/tonconnect-manifest.json', ston)).toBe(true);
  });
  it('refuse un manifeste qui usurpe un autre domaine', () => {
    expect(manifestOriginMatches('https://ston-fi.evil.io/tonconnect-manifest.json', ston)).toBe(false);
    expect(manifestOriginMatches('https://app.ston.fi.evil.io/m.json', ston)).toBe(false);
  });
});

describe('liens Kalyx (liste officielle des wallets)', () => {
  const { KALYX_BRIDGE } = require('./connectLink');
  const q = V.tonkeeper.slice(V.tonkeeper.indexOf('?'));
  it.each([['kalyx://' + q], ['https://kalyxwallet.com/ton-connect' + q]])('%s : reconnu, réponse sur le pont officiel', (link) => {
    expect(looksLikeTonConnect(link)).toBe(true);
    expect(parseConnectLink(link)).toMatchObject({ clientId: V.id, bridge: KALYX_BRIDGE });
  });
});
