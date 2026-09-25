import { buildTransferMessage, signAndSerialize, encodeLength } from './solTx';
import { deriveSolanaSigner } from '../../crypto/solana';
import { mnemonicToSeedSync } from '../../crypto/mnemonic';
import { ed25519 } from '@noble/curves/ed25519';
import { base58, base64 } from '@scure/base';

const MNEMO = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
const FROM = 'HAgk14JpMQLgt6rVgv7cBQFJWFto5Dqxi472uT3DKpqk'; // adresse dérivée index 0
const TO = 'GsbwXfJraMomNxBcpR3DBNxnKwAzc6dvfL3zYVXpChJ8'; // adresse Solana arbitraire valide
const BLOCKHASH = 'EETubP5AKHgjPAhzPAFcb8BAY1hMH639CWCFTqi3hq1k'; // blockhash figé (déterminisme)

describe('encodeLength (compact-u16)', () => {
  it('encode les petites longueurs sur un octet', () => {
    expect(encodeLength(0)).toEqual([0]);
    expect(encodeLength(1)).toEqual([1]);
    expect(encodeLength(127)).toEqual([127]);
  });
  it('encode 128 sur deux octets', () => {
    expect(encodeLength(128)).toEqual([0x80, 1]);
  });
});

describe('buildTransferMessage', () => {
  it('a la structure attendue (en-tête, 3 comptes, blockhash, instruction)', () => {
    const msg = buildTransferMessage({ from: FROM, to: TO, lamports: 1_000_000_000n, recentBlockhash: BLOCKHASH });
    // En-tête : 1 signature, 0 readonly signé, 1 readonly non signé.
    expect([msg[0], msg[1], msg[2]]).toEqual([1, 0, 1]);
    // Compte-array : longueur 3 puis les 3 clés (32 octets chacune).
    expect(msg[3]).toBe(3);
    expect(Array.from(msg.slice(4, 36))).toEqual(Array.from(base58.decode(FROM)));
    expect(Array.from(msg.slice(36, 68))).toEqual(Array.from(base58.decode(TO)));
    // System Program = 32 octets à zéro.
    expect(Array.from(msg.slice(68, 100))).toEqual(new Array(32).fill(0));
    // Blockhash.
    expect(Array.from(msg.slice(100, 132))).toEqual(Array.from(base58.decode(BLOCKHASH)));
  });

  it('encode le montant en u64 little-endian dans les données', () => {
    const msg = buildTransferMessage({ from: FROM, to: TO, lamports: 1n, recentBlockhash: BLOCKHASH });
    // Les 12 derniers octets = instruction data : [02,00,00,00] (transfer) + u64 LE.
    const data = Array.from(msg.slice(-12));
    expect(data.slice(0, 4)).toEqual([2, 0, 0, 0]); // index transfer
    expect(data.slice(4)).toEqual([1, 0, 0, 0, 0, 0, 0, 0]); // 1 lamport, LE
  });

  it('rejette une clé de mauvaise taille', () => {
    expect(() => buildTransferMessage({ from: 'abc', to: TO, lamports: 1n, recentBlockhash: BLOCKHASH })).toThrow();
  });
});

describe('signAndSerialize', () => {
  it('produit une tx dont la signature ed25519 vérifie le message', () => {
    const signer = deriveSolanaSigner(mnemonicToSeedSync(MNEMO), 0);
    const msg = buildTransferMessage({ from: FROM, to: TO, lamports: 500_000n, recentBlockhash: BLOCKHASH });
    const wire = base64.decode(signAndSerialize(msg, signer.secretKey));
    // Structure filaire : [01][sig 64 octets][message].
    expect(wire[0]).toBe(1);
    const sig = wire.slice(1, 65);
    const message = wire.slice(65);
    expect(Array.from(message)).toEqual(Array.from(msg));
    // La signature est valide pour ce message et cette clé publique.
    expect(ed25519.verify(sig, message, signer.publicKey)).toBe(true);
  });

  it('une clé étrangère ne valide pas la signature', () => {
    const signer = deriveSolanaSigner(mnemonicToSeedSync(MNEMO), 0);
    const other = deriveSolanaSigner(mnemonicToSeedSync(MNEMO), 1);
    const msg = buildTransferMessage({ from: FROM, to: TO, lamports: 500_000n, recentBlockhash: BLOCKHASH });
    const wire = base64.decode(signAndSerialize(msg, signer.secretKey));
    expect(ed25519.verify(wire.slice(1, 65), wire.slice(65), other.publicKey)).toBe(false);
  });
});

describe('Solana Pay — transfert SOL natif', () => {
  const REF = 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB';
  const MEMO_PROGRAM_ID = 'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr';

  function keysOf(msg: Uint8Array): string[] {
    let i = 3;
    const count = msg[i];
    i += 1;
    const out: string[] = [];
    for (let k = 0; k < count; k++) {
      out.push(base58.encode(msg.slice(i, i + 32)));
      i += 32;
    }
    return out;
  }

  const base = { from: FROM, to: TO, lamports: 1_000_000n, recentBlockhash: BLOCKHASH };

  it('le repère atterrit dans les comptes', () => {
    expect(keysOf(buildTransferMessage(base))).not.toContain(REF);
    expect(keysOf(buildTransferMessage({ ...base, references: [REF] }))).toContain(REF);
  });

  it('le mémo ajoute le programme SPL Memo', () => {
    expect(keysOf(buildTransferMessage({ ...base, memo: 'facture 7' }))).toContain(MEMO_PROGRAM_ID);
  });

  it('sans repère ni mémo, la sortie ne change PAS', () => {
    // Garantit qu'un transfert ordinaire n'est pas affecté par l'ajout.
    const a = buildTransferMessage(base);
    const b = buildTransferMessage({ ...base, references: undefined, memo: undefined });
    expect(Array.from(a)).toEqual(Array.from(b));
  });
});
