import { Transaction, p2wpkh, NETWORK } from '@scure/btc-signer';
import { base64 } from '@scure/base';
import { secp256k1 } from '@noble/curves/secp256k1';
import { summarizePsbt } from './psbtSummary';

const me = p2wpkh(secp256k1.getPublicKey(new Uint8Array(32).fill(7), true), NETWORK);
const them = p2wpkh(secp256k1.getPublicKey(new Uint8Array(32).fill(9), true), NETWORK);

function psbt(outputs: { address: string; amount: bigint }[], withAmounts = true) {
  const tx = new Transaction();
  tx.addInput({ txid: new Uint8Array(32).fill(1), index: 0, ...(withAmounts ? { witnessUtxo: { script: me.script, amount: 100_000n } } : {}) });
  for (const o of outputs) tx.addOutputAddress(o.address, o.amount, NETWORK);
  return base64.encode(tx.toPSBT());
}

describe('PSBT : ce qui quitte vraiment le portefeuille', () => {
  it('un drain déguisé : tout part chez un inconnu, montant et frais visibles', () => {
    const s = summarizePsbt(psbt([{ address: them.address!, amount: 98_000n }]), [me.address!])!;
    expect(s.sent).toBe(98_000n);
    expect(s.fee).toBe(2_000n);
    expect(s.ownIn).toBe(100_000n);
    expect(s.outputs).toEqual([{ address: them.address, sats: 98_000n, mine: false }]);
  });

  it('la monnaie rendue vers soi ne compte pas comme envoyée', () => {
    const s = summarizePsbt(psbt([{ address: them.address!, amount: 30_000n }, { address: me.address!, amount: 69_000n }]), [me.address!])!;
    expect(s.sent).toBe(30_000n);
    expect(s.outputs[1].mine).toBe(true);
    expect(s.fee).toBe(1_000n);
  });

  it('entrée sans montant : on le DIT, sans inventer de frais', () => {
    const s = summarizePsbt(psbt([{ address: them.address!, amount: 10_000n }], false), [me.address!])!;
    expect(s.unknownInputs).toBe(true);
    expect(s.fee).toBeNull();
    expect(s.sent).toBe(10_000n);
  });

  it('PSBT illisible : null', () => {
    expect(summarizePsbt('not-a-psbt', [me.address!])).toBeNull();
  });
});
