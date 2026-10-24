import { base58, base64 } from '@scure/base';
import { simulateSolanaTx, parseTokenAccount, writableStatic, lookupAddresses, solanaSimError } from './solanaSimulate';
import { parseSolanaMessage } from '../wc/solanaTx';
import { SPL_TOKEN_PROGRAM } from '../tokens/splTokens';

const key = (n: number) => { const b = new Uint8Array(32); b[0] = n; b[31] = 7; return b; };
const addr = (n: number) => base58.encode(key(n));
const OWNER = addr(1);
const TOKEN_ACCT = addr(2);
const PROGRAM = addr(3);
const USDC = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

/** Transaction legacy : 1 signataire (OWNER), compte de token modifiable, programme en lecture seule. */
function legacyTx(): string {
  const msg = [1, 0, 1, 3, ...key(1), ...key(2), ...key(3), ...new Uint8Array(32), 1, 2, 2, 0, 1, 1, 9];
  return base64.encode(Uint8Array.from([1, ...new Uint8Array(64), ...msg]));
}

function tokenAccount(mint: string, owner: string, amount: bigint, delegate?: { to: string; amount: bigint }): string {
  const d = new Uint8Array(165);
  d.set(base58.decode(mint), 0);
  d.set(base58.decode(owner), 32);
  for (let i = 0; i < 8; i++) d[64 + i] = Number((amount >> BigInt(8 * i)) & 0xffn);
  if (delegate) {
    d[72] = 1;
    d.set(base58.decode(delegate.to), 76);
    for (let i = 0; i < 8; i++) d[121 + i] = Number((delegate.amount >> BigInt(8 * i)) & 0xffn);
  }
  d[108] = 1;
  return base64.encode(d);
}
const acct = (lamports: number, data = '', owner = '11111111111111111111111111111111') => ({ lamports, owner, data: [data, 'base64'] });
const mintAcct = (decimals: number) => { const d = new Uint8Array(82); d[44] = decimals; return acct(1, base64.encode(d), SPL_TOKEN_PROGRAM); };

function rpcWith(pre: unknown[], post: unknown[], err: unknown = null, logs: string[] = []) {
  const calls: { method: string; params: unknown[] }[] = [];
  const rpc = jest.fn(async (method: string, params: unknown[]) => {
    calls.push({ method, params });
    if (method === 'simulateTransaction') return { value: { err, logs, accounts: err ? null : post } };
    const list = params[0] as string[];
    if (list[0] === USDC) return { value: [mintAcct(6)] };
    return { value: pre };
  }) as unknown as Parameters<typeof simulateSolanaTx>[0];
  return { rpc, calls };
}

describe('simulateSolanaTx', () => {
  it('SOL et USDC : soldes avant / après du compte qui signe', async () => {
    const pre = [acct(2_000_000_000), acct(2_039_280, tokenAccount(USDC, OWNER, 5_000_000n), SPL_TOKEN_PROGRAM)];
    const post = [acct(1_499_995_000), acct(2_039_280, tokenAccount(USDC, OWNER, 80_000_000n), SPL_TOKEN_PROGRAM)];
    const { rpc, calls } = rpcWith(pre, post);
    const sim = await simulateSolanaTx(rpc, legacyTx(), OWNER);
    expect(sim.error).toBeUndefined();
    expect(sim.changes).toEqual([
      { direction: 'out', assetType: 'NATIVE', symbol: 'SOL', rawAmount: '500005000', decimals: 9 },
      expect.objectContaining({ direction: 'in', assetType: 'ERC20', symbol: 'USDC', rawAmount: '75000000', decimals: 6, contract: USDC }),
    ]);
    // Seuls les comptes MODIFIABLES sont lus ; la signature n'est pas vérifiée (pas encore signée).
    const simCall = calls.find((c) => c.method === 'simulateTransaction')!;
    expect((simCall.params[1] as { accounts: { addresses: string[] } }).accounts.addresses).toEqual([OWNER, TOKEN_ACCT]);
    expect(simCall.params[1]).toMatchObject({ sigVerify: false, replaceRecentBlockhash: true });
  });

  it('frais seuls : pas de mouvement inventé', async () => {
    const { rpc } = rpcWith([acct(1_000_000_000), null], [acct(999_995_000), null]);
    expect((await simulateSolanaTx(rpc, legacyTx(), OWNER)).changes).toEqual([]);
  });

  it('délégation (Approve) sans limite : relevée', async () => {
    const thief = addr(9);
    const pre = [acct(1_000_000_000), acct(2_039_280, tokenAccount(USDC, OWNER, 5n), SPL_TOKEN_PROGRAM)];
    const post = [acct(999_995_000), acct(2_039_280, tokenAccount(USDC, OWNER, 5n, { to: thief, amount: (1n << 64n) - 1n }), SPL_TOKEN_PROGRAM)];
    const { rpc } = rpcWith(pre, post);
    const sim = await simulateSolanaTx(rpc, legacyTx(), OWNER);
    expect(sim.approvals).toEqual([{ spender: thief, token: USDC, unlimited: true }]);
  });

  it('changement de titulaire (SetAuthority) : tout le solde part, vers le nouveau titulaire', async () => {
    const thief = addr(9);
    const pre = [acct(1_000_000_000), acct(2_039_280, tokenAccount(USDC, OWNER, 42_000_000n), SPL_TOKEN_PROGRAM)];
    const post = [acct(999_995_000), acct(2_039_280, tokenAccount(USDC, thief, 42_000_000n), SPL_TOKEN_PROGRAM)];
    const { rpc } = rpcWith(pre, post);
    const sim = await simulateSolanaTx(rpc, legacyTx(), OWNER);
    expect(sim.changes).toEqual([expect.objectContaining({ direction: 'out', symbol: 'USDC', rawAmount: '42000000', counterparty: thief })]);
  });

  it('échec : la cause lue dans les journaux du programme', async () => {
    const { rpc } = rpcWith([], [], { InstructionError: [0, { Custom: 1 }] }, ['Program log: Instruction: Transfer', 'Program log: Error: insufficient funds', 'Program Tokenkeg consumed 4000 of 200000 compute units']);
    const sim = await simulateSolanaTx(rpc, legacyTx(), OWNER);
    expect(sim.error).toBe('Error: insufficient funds');
    expect(sim.changes).toEqual([]);
  });
});

describe('outils', () => {
  it('writableStatic : en-tête lu (signataires modifiables, puis non-signataires modifiables)', () => {
    const msg = parseSolanaMessage(base64.decode(legacyTx()).subarray(65));
    expect(writableStatic(msg)).toEqual([OWNER, TOKEN_ACCT]);
  });
  it('lookupAddresses : adresses après l’en-tête de 56 octets', () => {
    const d = new Uint8Array(56 + 64);
    d.set(key(4), 56);
    d.set(key(5), 88);
    expect(lookupAddresses(d)).toEqual([addr(4), addr(5)]);
  });
  it('parseTokenAccount : ignore un compte qui n’est pas un compte de token', () => {
    expect(parseTokenAccount('11111111111111111111111111111111', new Uint8Array(165))).toBeNull();
    expect(parseTokenAccount(SPL_TOKEN_PROGRAM, new Uint8Array(82))).toBeNull();
  });
  it('solanaSimError : repli sur l’erreur brute', () => {
    expect(solanaSimError('BlockhashNotFound', [])).toBe('BlockhashNotFound');
  });
});
