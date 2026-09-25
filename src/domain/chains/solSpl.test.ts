import { buildSplTransferMessage, transferCheckedIx, TOKEN_PROGRAM, TOKEN_2022_PROGRAM } from './solSpl';
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

describe('buildSplTransferMessage — Token-2022', () => {
  const FROM = '9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PQtwhpU';
  const TO = 'HAgk14JpMQLgt6rVgv7cBQFJWFto5Dqxi472uT3DKpqk';
  const MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
  const BH = 'EkSnNWid2cvwEVnVx9aBqawnmiCNiDgp3gUdkDPTKN1N';

  const params = { from: FROM, to: TO, mint: MINT, amount: 1_000_000n, decimals: 6, recentBlockhash: BH };

  /** Clés de comptes du message, dans l'ordre. */
  function keys(msg: Uint8Array): string[] {
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

  it('vise le programme Token-2022 quand on le lui dit', () => {
    // Le message référençait toujours le programme historique : un mint
    // Token-2022 était donc inenvoyable, sans message compréhensible.
    const msg = buildSplTransferMessage({ ...params, tokenProgram: TOKEN_2022_PROGRAM });
    expect(keys(msg)).toContain(TOKEN_2022_PROGRAM);
    expect(keys(msg)).not.toContain(TOKEN_PROGRAM);
  });

  it('vise le programme historique par défaut', () => {
    const msg = buildSplTransferMessage(params);
    expect(keys(msg)).toContain(TOKEN_PROGRAM);
    expect(keys(msg)).not.toContain(TOKEN_2022_PROGRAM);
  });

  it('les ATA diffèrent selon le programme : ce ne sont pas les mêmes comptes', () => {
    const legacy = keys(buildSplTransferMessage(params));
    const t2022 = keys(buildSplTransferMessage({ ...params, tokenProgram: TOKEN_2022_PROGRAM }));
    // Même émetteur, même destinataire, même mint — et pourtant des comptes de
    // jeton distincts, parce que le programme entre dans les seeds.
    expect(legacy.filter((k) => !t2022.includes(k)).length).toBeGreaterThan(0);
  });
});
