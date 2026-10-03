import { base64, hex } from '@scure/base';
import V from './nacl-box-vectors.json';
import { decryptMessage, encryptMessage, newSessionKeyPair } from './sessionCrypto';

/* Vecteurs produits par tweetnacl 1.0.3 — la bibliothèque de @tonconnect/protocol. */
describe('crypto_box, identique à tweetnacl', () => {
  it.each(V.messages.map((m, i) => [i, m] as const))('déchiffre le message %s de la dApp', (_i, m) => {
    expect(decryptMessage(base64.decode(m.blob), V.dapp.publicKey, V.wallet.secretKey)).toBe(m.plaintext);
  });

  it.each(V.messages.map((m, i) => [i, m] as const))('chiffre le message %s octet pour octet', (_i, m) => {
    // Même nonce, sens inverse de la clé : la boîte est symétrique (x25519 commutatif).
    const blob = encryptMessage(m.plaintext, V.wallet.publicKey, V.dapp.secretKey, hex.decode(m.nonce));
    expect(base64.encode(blob)).toBe(m.blob);
  });

  it('rejette un message altéré', () => {
    const blob = base64.decode(V.messages[0].blob);
    blob[40] ^= 1;
    expect(() => decryptMessage(blob, V.dapp.publicKey, V.wallet.secretKey)).toThrow();
  });

  it('clé de session : x25519, 32 octets, jamais deux fois la même', () => {
    const a = newSessionKeyPair();
    const b = newSessionKeyPair();
    expect(a.publicKey).toMatch(/^[0-9a-f]{64}$/);
    expect(a.secretKey).not.toBe(b.secretKey);
    const msg = encryptMessage('ping', b.publicKey, a.secretKey);
    expect(decryptMessage(msg, a.publicKey, b.secretKey)).toBe('ping');
  });
});
