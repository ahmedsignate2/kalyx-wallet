import { base58 } from '@scure/base';
import { utf8ToBytes } from '@noble/hashes/utils';
import { looksLikeSolanaTransaction, solanaMessageBytes } from './solanaMessage';

describe('solanaMessageBytes — on signe ce qui est montré', () => {
  it('base58 de texte : décodé, texte montré', () => {
    const r = solanaMessageBytes(base58.encode(utf8ToBytes('Connexion à Kalyx')));
    expect(r.text).toBe('Connexion à Kalyx');
    expect(Array.from(r.bytes)).toEqual(Array.from(utf8ToBytes('Connexion à Kalyx')));
  });
  it('pas du base58 : le texte lui-même, jamais une devinette base64', () => {
    const raw = 'SGVsbG8='; // base64 valide, mais « = » hors base58
    const r = solanaMessageBytes(raw);
    expect(r.text).toBe(raw);
    expect(Array.from(r.bytes)).toEqual(Array.from(utf8ToBytes(raw)));
  });
  it('binaire : aucun texte prétendu', () => {
    expect(solanaMessageBytes(base58.encode(new Uint8Array([0, 1, 2, 3]))).text).toBeNull();
  });
});

/** Transfert SystemProgram, octet par octet (format filaire Solana). */
function transferMessage(v0: boolean): Uint8Array {
  const key = (n: number) => new Array(32).fill(n);
  const data = [2, 0, 0, 0, 0x40, 0x42, 0x0f, 0, 0, 0, 0, 0]; // Transfer, 1 000 000 lamports
  return Uint8Array.from([
    ...(v0 ? [0x80] : []),
    1, 0, 1, // 1 signataire, 0 signé en lecture, 1 non signé en lecture
    3, ...key(1), ...key(2), ...new Array(32).fill(0), // payeur, destinataire, SystemProgram
    ...key(9), // blockhash
    1, 2, 2, 0, 1, data.length, ...data,
    ...(v0 ? [0] : []), // aucune table d'adresses
  ]);
}

describe('looksLikeSolanaTransaction — un transfert déguisé en message est reconnu', () => {
  it.each([false, true])('message (v0 = %s)', (v0) => {
    expect(looksLikeSolanaTransaction(transferMessage(v0))).toBe(true);
  });
  it('transaction complète (signatures + message)', () => {
    expect(looksLikeSolanaTransaction(Uint8Array.from([1, ...new Array(64).fill(0), ...transferMessage(true)]))).toBe(true);
  });
  it('un vrai message texte passe', () => {
    expect(looksLikeSolanaTransaction(utf8ToBytes('Sign in to example.com\nNonce: 8f2a'))).toBe(false);
    expect(looksLikeSolanaTransaction(new Uint8Array(0))).toBe(false);
  });
  it('octets en trop : ce n\'est plus le message que couvrirait la signature', () => {
    expect(looksLikeSolanaTransaction(Uint8Array.from([...transferMessage(false), 0]))).toBe(false);
  });
});
