import { parseSolanaMessage } from '../wc/solanaTx';
import { buildBurnMessage, burnIx, closeAccountIx, parseBurnTarget, MAX_BURN_ACCOUNTS } from './solBurn';
import { TOKEN_PROGRAM, TOKEN_2022_PROGRAM } from '../chains/solSpl';

const OWNER = 'C4mVQ8XAvExtSQ2ve5wuDMRwrBGwcBqWkaQWzRWw6vQh';
const MINT = '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU';
const ACC = 'GQrB4P8Dq9ZaQvKLmJxkqzyfJfgPZJbm1oFGJ5Vv7vQE';
const BLOCKHASH = 'EkSnNWid2cvwEVnVx9aBqawnmiCNiDgp3gUdkDPTKN1N';

function account(over: Record<string, unknown> = {}, info: Record<string, unknown> = {}) {
  return {
    pubkey: ACC,
    account: {
      lamports: 2_039_280,
      owner: TOKEN_PROGRAM,
      data: { parsed: { info: { mint: MINT, owner: OWNER, state: 'initialized', tokenAmount: { amount: '1' }, ...info } } },
      ...over,
    },
  };
}

describe('solBurn — instructions', () => {
  it('Burn : discriminant 8 puis le montant en u64 little-endian', () => {
    const ix = burnIx(ACC, MINT, OWNER, 258n, TOKEN_PROGRAM);
    expect(Array.from(ix.data)).toEqual([8, 2, 1, 0, 0, 0, 0, 0, 0]);
    expect(ix.keys.map((k) => [k.pubkey, k.isSigner, k.isWritable])).toEqual([
      [ACC, false, true],
      [MINT, false, true],
      [OWNER, true, false],
    ]);
  });

  it('CloseAccount : discriminant 9, loyer rendu au propriétaire', () => {
    const ix = closeAccountIx(ACC, OWNER, OWNER, TOKEN_2022_PROGRAM);
    expect(ix.programId).toBe(TOKEN_2022_PROGRAM);
    expect(Array.from(ix.data)).toEqual([9]);
    expect(ix.keys[1]).toEqual({ pubkey: OWNER, isSigner: false, isWritable: true });
  });
});

describe('solBurn — lecture du compte de jeton', () => {
  it('compte normal : cible avec le loyer à récupérer', () => {
    const t = parseBurnTarget([account()], OWNER, MINT);
    expect(t).toEqual({ mint: MINT, rentLamports: 2_039_280n, accounts: [{ address: ACC, amount: 1n, tokenProgram: TOKEN_PROGRAM, lamports: 2_039_280n }] });
  });

  it('compte gelé (NFT programmable) : refus', () => {
    expect(parseBurnTarget([account({}, { state: 'frozen' })], OWNER, MINT)).toBe('frozen');
  });

  it("programme inconnu : refus, on n'envoie pas d'instruction à l'aveugle", () => {
    expect(parseBurnTarget([account({ owner: '11111111111111111111111111111111' })], OWNER, MINT)).toBe('unsupportedProgram');
  });

  it("compte d'un autre propriétaire ou d'un autre mint : ignoré", () => {
    expect(parseBurnTarget([account({}, { owner: MINT })], OWNER, MINT)).toBe('notFound');
    expect(parseBurnTarget([account({}, { mint: OWNER })], OWNER, MINT)).toBe('notFound');
    expect(parseBurnTarget(null, OWNER, MINT)).toBe('notFound');
  });

  it('nombre de comptes borné', () => {
    const many = Array.from({ length: MAX_BURN_ACCOUNTS + 3 }, () => account());
    const t = parseBurnTarget(many, OWNER, MINT);
    expect(typeof t === 'object' && t.accounts.length).toBe(MAX_BURN_ACCOUNTS);
  });
});

describe('solBurn — message', () => {
  it('Burn puis CloseAccount, payé et signé par le propriétaire seul', () => {
    const t = parseBurnTarget([account()], OWNER, MINT);
    if (typeof t !== 'object') throw new Error('cible attendue');
    const msg = parseSolanaMessage(buildBurnMessage(OWNER, t, BLOCKHASH));
    expect(msg.keys[0]).toBe(OWNER);
    expect(msg.signerCount).toBe(1);
    expect(msg.programIndexes.map((i) => msg.keys[i])).toEqual([TOKEN_PROGRAM, TOKEN_PROGRAM]);
  });

  it('compte déjà vide : seulement la fermeture', () => {
    const t = parseBurnTarget([account({}, { tokenAmount: { amount: '0' } })], OWNER, MINT);
    if (typeof t !== 'object') throw new Error('cible attendue');
    expect(parseSolanaMessage(buildBurnMessage(OWNER, t, BLOCKHASH)).programIndexes).toHaveLength(1);
  });
});
