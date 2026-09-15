import { base58, base64 } from '@scure/base';
import { describeSolanaTransaction, parseSolanaMessage } from './solanaTx';

/* Encodeur minimal du format Solana (miroir du décodeur), pour fabriquer des fixtures. */
function compact(n: number): number[] {
  const out: number[] = [];
  let v = n;
  for (;;) {
    let e = v & 0x7f;
    v >>= 7;
    if (v === 0) { out.push(e); return out; }
    e |= 0x80; out.push(e);
  }
}
function key(seed: number): Uint8Array { return new Uint8Array(32).fill(seed); }
function b58(seed: number): string { return base58.encode(key(seed)); }
const JUP = 'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4';
const SYSTEM = '11111111111111111111111111111111';

function buildTx(opts: { version: 'legacy' | 0; keys: Uint8Array[]; ixs: { program: number; accounts: number[]; data: number[] }[]; lookups?: number }): string {
  const m: number[] = [];
  if (opts.version === 0) m.push(0x80);
  m.push(1, 0, 1); // en-tête
  m.push(...compact(opts.keys.length));
  for (const k of opts.keys) m.push(...k);
  m.push(...new Uint8Array(32)); // blockhash
  m.push(...compact(opts.ixs.length));
  for (const ix of opts.ixs) { m.push(ix.program, ...compact(ix.accounts.length), ...ix.accounts, ...compact(ix.data.length), ...ix.data); }
  if (opts.version === 0) {
    const n = opts.lookups ?? 0;
    m.push(...compact(n));
    for (let i = 0; i < n; i++) m.push(...key(200 + i), ...compact(1), 3, ...compact(0));
  }
  const tx = [...compact(1), ...new Uint8Array(64), ...m];
  return base64.encode(new Uint8Array(tx));
}

describe('describeSolanaTransaction', () => {
  const payer = key(7);
  it('reconnaît un swap Jupiter dans une transaction v0 avec tables de correspondance', () => {
    const tx = buildTx({ version: 0, keys: [payer, base58.decode(JUP), base58.decode('ComputeBudget111111111111111111111111111111')], ixs: [{ program: 2, accounts: [], data: [2, 0, 0] }, { program: 1, accounts: [0], data: [1, 2, 3] }], lookups: 2 });
    const d = describeSolanaTransaction(tx, b58(7));
    expect(d).not.toBeNull();
    expect(d!.version).toBe(0);
    expect(d!.lookupTables).toBe(2);
    expect(d!.action).toBe('swap');
    expect(d!.dapp).toBe('Jupiter v6');
    expect(d!.known).toEqual(['Compute Budget', 'Jupiter v6']);
    expect(d!.instructions).toBe(2);
    expect(d!.feePayerMismatch).toBe(false);
  });

  it('lit une transaction legacy et un simple transfert', () => {
    const tx = buildTx({ version: 'legacy', keys: [payer, key(9), base58.decode(SYSTEM)], ixs: [{ program: 2, accounts: [0, 1], data: [2, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0] }] });
    const d = describeSolanaTransaction(tx);
    expect(d!.version).toBe('legacy');
    expect(d!.action).toBe('transfer');
    expect(d!.feePayer).toBe(b58(7));
  });

  it('signale un payeur inattendu, accepte le base58, refuse l’illisible', () => {
    const tx = buildTx({ version: 0, keys: [payer, base58.decode(JUP)], ixs: [{ program: 1, accounts: [0], data: [] }] });
    expect(describeSolanaTransaction(tx, b58(8))!.feePayerMismatch).toBe(true);
    expect(describeSolanaTransaction(base58.encode(base64.decode(tx)))!.action).toBe('swap');
    expect(describeSolanaTransaction('pas-une-transaction')).toBeNull();
    expect(() => parseSolanaMessage(new Uint8Array([0x81, 1, 0, 1]))).toThrow();
  });
});
