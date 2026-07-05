import { buildSplTransferMessage, transferCheckedIx, TOKEN_PROGRAM } from './solSpl';
import { buildTransactionMessage } from './solMessage';
import { signAndSerialize } from './solTx';
import { getAssociatedTokenAddress } from '../../crypto/solPda';
import { deriveSolanaSigner } from '../../crypto/solana';
import { mnemonicToSeedSync } from '../../crypto/mnemonic';
import { ed25519 } from '@noble/curves/ed25519';
import { base58, base64 } from '@scure/base';

const MNEMO = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
const FROM = 'HAgk14JpMQLgt6rVgv7cBQFJWFto5Dqxi472uT3DKpqk';
const TO = 'GsbwXfJraMomNxBcpR3DBNxnKwAzc6dvfL3zYVXpChJ8';
const USDC = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const BLOCKHASH = 'EETubP5AKHgjPAhzPAFcb8BAY1hMH639CWCFTqi3hq1k';

describe('transferCheckedIx', () => {
  it('encode le discriminant 12 + montant u64 LE + décimales', () => {
    const ix = transferCheckedIx('So11111111111111111111111111111111111111112', USDC, TO, FROM, 1_000_000n, 6);
    expect(ix.programId).toBe(TOKEN_PROGRAM);
    expect(ix.data[0]).toBe(12);
    expect(Array.from(ix.data.slice(1, 9))).toEqual([0x40, 0x42, 0x0f, 0, 0, 0, 0, 0]); // 1_000_000 LE
    expect(ix.data[9]).toBe(6); // décimales
    // Le propriétaire est signataire.
    expect(ix.keys.find((k) => k.pubkey === FROM)?.isSigner).toBe(true);
  });
});

describe('buildTransactionMessage (en-tête & ordre)', () => {
  it('place le payeur en compte 0 et compte correctement les signataires', () => {
    const msg = buildTransactionMessage(FROM, BLOCKHASH, [
      transferCheckedIx('So11111111111111111111111111111111111111112', USDC, TO, FROM, 1n, 6),
    ]);
    // En-tête : 1 signataire requis.
    expect(msg[0]).toBe(1);
    // Compte 0 = payeur (FROM), juste après l'en-tête (3) + longueur du tableau (1).
    expect(Array.from(msg.slice(4, 36))).toEqual(Array.from(base58.decode(FROM)));
  });
});

describe('buildSplTransferMessage', () => {
  it('utilise les bons ATAs source/destination', () => {
    const source = getAssociatedTokenAddress(USDC, FROM);
    const dest = getAssociatedTokenAddress(USDC, TO);
    const msg = buildSplTransferMessage({ from: FROM, to: TO, mint: USDC, amount: 5n, decimals: 6, recentBlockhash: BLOCKHASH });
    const hay = base58.encode(msg); // recherche grossière des clés dans les octets
    // Les ATAs (32 octets) doivent apparaître dans les clés de comptes du message.
    const bytes = Array.from(msg).join(',');
    expect(bytes).toContain(Array.from(base58.decode(source)).join(','));
    expect(bytes).toContain(Array.from(base58.decode(dest)).join(','));
    expect(hay.length).toBeGreaterThan(0);
  });

  it('produit une transaction signée valide (ed25519.verify)', () => {
    const signer = deriveSolanaSigner(mnemonicToSeedSync(MNEMO), 0);
    const msg = buildSplTransferMessage({ from: FROM, to: TO, mint: USDC, amount: 5n, decimals: 6, recentBlockhash: BLOCKHASH });
    const wire = base64.decode(signAndSerialize(msg, signer.secretKey));
    expect(wire[0]).toBe(1); // une signature
    expect(ed25519.verify(wire.slice(1, 65), wire.slice(65), signer.publicKey)).toBe(true);
  });
});
