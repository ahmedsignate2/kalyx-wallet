import { hexToText, parseSiwe, siweDomainMismatch, summarizeTypedData } from './message';

// Encode une chaîne UTF-8 en hex 0x… (équivalent de ce qu'envoient les dApps).
function toHex(text: string): string {
  return '0x' + Buffer.from(text, 'utf8').toString('hex');
}

const SIWE_EXAMPLE = `opensea.io wants you to sign in with your Ethereum account:
0x7F101fE45e6649A6fB8F3F8B43ed03D353f2B90c

Click to sign in and accept the OpenSea Terms of Service.

URI: https://opensea.io
Version: 1
Chain ID: 1
Nonce: 32891756
Issued At: 2026-07-01T16:25:24Z`;

describe('hexToText', () => {
  it('décode un message hex UTF-8 (accents inclus)', () => {
    expect(hexToText(toHex('Hello Kalyx'))).toBe('Hello Kalyx');
    expect(hexToText(toHex('Signé à 100 %'))).toBe('Signé à 100 %');
  });

  it('accepte les retours à la ligne et tabulations', () => {
    expect(hexToText(toHex('ligne 1\nligne 2\ttab'))).toBe('ligne 1\nligne 2\ttab');
  });

  it('rejette le binaire, le hex invalide et le vide', () => {
    expect(hexToText('0x00ff17')).toBeNull(); // octets de contrôle
    expect(hexToText('0xzz')).toBeNull();
    expect(hexToText('0x123')).toBeNull(); // longueur impaire
    expect(hexToText('0x')).toBeNull();
    expect(hexToText('pas du hex')).toBeNull();
  });

  it('rejette un UTF-8 invalide (U+FFFD)', () => {
    expect(hexToText('0xc328')).toBeNull(); // séquence UTF-8 tronquée
  });
});

describe('parseSiwe', () => {
  it('parse un message SIWE réel (OpenSea)', () => {
    const siwe = parseSiwe(SIWE_EXAMPLE);
    expect(siwe).not.toBeNull();
    expect(siwe!.domain).toBe('opensea.io');
    expect(siwe!.address).toBe('0x7F101fE45e6649A6fB8F3F8B43ed03D353f2B90c');
    expect(siwe!.statement).toBe('Click to sign in and accept the OpenSea Terms of Service.');
    expect(siwe!.uri).toBe('https://opensea.io');
    expect(siwe!.chainId).toBe(1);
    expect(siwe!.nonce).toBe('32891756');
    expect(siwe!.issuedAt).toBe('2026-07-01T16:25:24Z');
  });

  it('parse un SIWE sans statement et avec CRLF', () => {
    const txt = 'app.uniswap.org wants you to sign in with your Ethereum account:\r\n0x7F101fE45e6649A6fB8F3F8B43ed03D353f2B90c\r\n\r\nURI: https://app.uniswap.org\r\nVersion: 1\r\nChain ID: 137\r\nNonce: abc123';
    const siwe = parseSiwe(txt);
    expect(siwe).not.toBeNull();
    expect(siwe!.domain).toBe('app.uniswap.org');
    expect(siwe!.statement).toBeUndefined();
    expect(siwe!.chainId).toBe(137);
  });

  it('retourne null pour un texte quelconque', () => {
    expect(parseSiwe('Bonjour, signe ce message')).toBeNull();
    expect(parseSiwe('')).toBeNull();
  });

  it('chaîne complète : hex → texte → SIWE', () => {
    const siwe = parseSiwe(hexToText(toHex(SIWE_EXAMPLE))!);
    expect(siwe!.domain).toBe('opensea.io');
  });
});

describe('siweDomainMismatch', () => {
  it('accepte le même domaine, www et les sous-domaines', () => {
    expect(siweDomainMismatch('opensea.io', 'https://opensea.io')).toBe(false);
    expect(siweDomainMismatch('opensea.io', 'https://www.opensea.io/fr')).toBe(false);
    expect(siweDomainMismatch('app.uniswap.org', 'https://uniswap.org')).toBe(false);
    expect(siweDomainMismatch('uniswap.org', 'https://app.uniswap.org')).toBe(false);
  });

  it('détecte un domaine différent (phishing)', () => {
    expect(siweDomainMismatch('opensea.io', 'https://opensea-mint.xyz')).toBe(true);
    expect(siweDomainMismatch('evil.com', 'https://opensea.io')).toBe(true);
  });

  it('ne conclut rien sans info', () => {
    expect(siweDomainMismatch('', 'https://opensea.io')).toBe(false);
    expect(siweDomainMismatch('opensea.io', '')).toBe(false);
  });
});

describe('summarizeTypedData', () => {
  const permit = {
    domain: { name: 'USD Coin', chainId: 1, verifyingContract: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' },
    primaryType: 'Permit',
    types: {},
    message: {},
  };

  it('résume un Permit EIP-712 (objet et JSON string)', () => {
    for (const input of [permit, JSON.stringify(permit)]) {
      const s = summarizeTypedData(input);
      expect(s).toMatchObject({
        name: 'USD Coin',
        primaryType: 'Permit',
        chainId: 1,
        verifyingContract: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
      });
    }
  });

  it('extrait spender / montant / échéance d’un Permit ERC-2612', () => {
    const s = summarizeTypedData({
      domain: { name: 'USD Coin', chainId: 1, verifyingContract: '0xA0b8' },
      primaryType: 'Permit',
      message: { owner: '0xowner', spender: '0xSpender', value: '1000000', nonce: 0, deadline: 1893456000 },
    });
    expect(s?.details).toEqual([
      { label: 'Autorisé (spender)', value: '0xSpender' },
      { label: 'Montant', value: '1000000' },
      { label: 'Échéance', value: '2030-01-01 00:00 UTC' },
    ]);
  });

  it('signale un montant ILLIMITÉ (uint256 max) et une absence d’échéance', () => {
    const max = (2n ** 256n - 1n).toString();
    const s = summarizeTypedData({
      domain: { name: 'DAI' },
      primaryType: 'Permit',
      message: { spender: '0xEvil', value: max, deadline: max },
    });
    expect(s?.details).toContainEqual({ label: 'Montant', value: 'Illimité ⚠️' });
    expect(s?.details).toContainEqual({ label: 'Échéance', value: 'Sans expiration ⚠️' });
  });

  it('gère Permit2 (champs imbriqués sous details)', () => {
    const s = summarizeTypedData({
      domain: { name: 'Permit2' },
      primaryType: 'PermitSingle',
      message: {
        details: { token: '0xToken', amount: '500', expiration: 1893456000 },
        spender: '0xUniversalRouter',
        sigDeadline: 1893456000,
      },
    });
    expect(s?.details).toContainEqual({ label: 'Autorisé (spender)', value: '0xUniversalRouter' });
    expect(s?.details).toContainEqual({ label: 'Token', value: '0xToken' });
    expect(s?.details).toContainEqual({ label: 'Montant', value: '500' });
  });

  it('retourne null si rien d’exploitable', () => {
    expect(summarizeTypedData('pas du json')).toBeNull();
    expect(summarizeTypedData({})).toBeNull();
    expect(summarizeTypedData(null)).toBeNull();
  });
});
