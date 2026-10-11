import { sanitizeLog } from './sanitizeLog';

const HASH = `0x${'a'.repeat(16)}${'b'.repeat(16)}${'c'.repeat(16)}${'d'.repeat(16)}`;
const KEY = '4c0883a69102937d6231471b5dbb6204fe5129617082792ae468d01a3f362318';
const SOL_SIG = '5VERv8NMvzbJMEkV8xnrLkEaWRtSz9CosKDYjCJjBRnbJLgp8uirBgmQpjKhoR4tjF3ZpRzrFmBV6UjKdiSZkQUW';

describe('sanitizeLog — hashes de transaction connus', () => {
  it('un hash CONNU reste lisible, raccourci', () => {
    expect(sanitizeLog(`tx envoyée ${HASH}`, [HASH])).toBe('tx envoyée 0xaaaa…dddd');
    // Casse et préfixe indifférents ; txid Bitcoin (sans 0x) aussi.
    expect(sanitizeLog(`txid ${HASH.slice(2)}`, [HASH.toUpperCase()])).toBe('txid aaaa…dddd');
    expect(sanitizeLog(`sig ${SOL_SIG}`, [SOL_SIG])).toBe(`sig ${SOL_SIG.slice(0, 4)}…${SOL_SIG.slice(-4)}`);
  });

  it('JSON : le hash connu de `details` reste lisible et le JSON valide', () => {
    const out = JSON.parse(sanitizeLog(JSON.stringify({ txHash: HASH }), () => [HASH]));
    expect(out.txHash).toBe('0xaaaa…dddd');
  });

  it('toute AUTRE valeur de même forme reste masquée (peut être une clé privée)', () => {
    expect(sanitizeLog(`tx: 0x${KEY}`, [HASH])).toBe('tx: [CLÉ_PRIVÉE_MASQUÉE]');
    expect(sanitizeLog(`clé ${KEY}`)).toBe('clé [CLÉ_PRIVÉE_MASQUÉE]');
    expect(sanitizeLog(`${HASH} ${KEY}`, [HASH])).toBe('0xaaaa…dddd [CLÉ_PRIVÉE_MASQUÉE]');
    // Un hash connu ne « couvre » pas une valeur de 128 hex qui le contient.
    expect(sanitizeLog(`${HASH}${HASH.slice(2)}`, [HASH])).toBe('[CLÉ_PRIVÉE_MASQUÉE]');
    expect(sanitizeLog(`sig ${SOL_SIG}`)).toBe('sig [CLÉ_SOL_MASQUÉE]');
  });

  it('historique illisible : on masque, sans lever', () => {
    const boom = () => {
      throw new Error('historique indisponible');
    };
    expect(sanitizeLog(`tx ${HASH}`, boom)).toBe('tx [CLÉ_PRIVÉE_MASQUÉE]');
  });

  it("la liste n'est lue qu'en présence d'un candidat, une seule fois", () => {
    const provider = jest.fn(() => [HASH]);
    sanitizeLog('rien à masquer ici', provider);
    expect(provider).not.toHaveBeenCalled();
    sanitizeLog(`${HASH} et ${KEY}`, provider);
    expect(provider).toHaveBeenCalledTimes(1);
  });
});
