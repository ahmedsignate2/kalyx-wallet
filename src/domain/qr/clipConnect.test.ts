import { clipConnectLink } from './clipConnect';

const topic = 'a'.repeat(64);
const key = 'b'.repeat(64);
const wc = `wc:${topic}@2?relay-protocol=irn&symKey=${key}&expiryTimestamp=1800000000`;
const r = encodeURIComponent(JSON.stringify({ manifestUrl: 'https://app.ston.fi/tonconnect-manifest.json', items: [{ name: 'ton_addr' }] }));

describe('Lien de connexion copié', () => {
  it('reconnaît un appairage WalletConnect v2', () => {
    expect(clipConnectLink(`  ${wc}\n`)).toEqual({ kind: 'walletconnect', link: wc });
  });
  it('reconnaît une demande TON Connect (tc:// et lien universel)', () => {
    expect(clipConnectLink(`tc://?v=2&id=${'c'.repeat(64)}&r=${r}&ret=none`)?.kind).toBe('tonconnect');
    expect(clipConnectLink(`https://app.tonkeeper.com/ton-connect?v=2&id=${'c'.repeat(64)}&r=${r}&ret=none`)?.kind).toBe('tonconnect');
  });
  it('ignore tout le reste : adresse, phrase, lien web, WalletConnect v1 ou sans clé', () => {
    expect(clipConnectLink('0x52908400098527886E0F7030069857D2E4169EE7')).toBeNull();
    expect(clipConnectLink('abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about')).toBeNull();
    expect(clipConnectLink('https://app.uniswap.org')).toBeNull();
    expect(clipConnectLink(`wc:${topic}@1?bridge=https%3A%2F%2Fbridge.walletconnect.org&key=${key}`)).toBeNull();
    expect(clipConnectLink(`wc:${topic}@2?relay-protocol=irn`)).toBeNull();
    expect(clipConnectLink('')).toBeNull();
    expect(clipConnectLink(null)).toBeNull();
    expect(clipConnectLink('wc:' + 'a'.repeat(5000))).toBeNull();
  });
});
