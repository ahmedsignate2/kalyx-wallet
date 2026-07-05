import { parseSolanaTx, type SolTxResponse } from './solHistory';

const ME = 'HAgk14JpMQLgt6rVgv7cBQFJWFto5Dqxi472uT3DKpqk';
const OTHER = 'GsbwXfJraMomNxBcpR3DBNxnKwAzc6dvfL3zYVXpChJ8';

function tx(partial: Partial<SolTxResponse['meta']>, keys: string[], sigs = ['sig1']): SolTxResponse {
  return {
    blockTime: 1_700_000_000,
    meta: { err: null, fee: 5000, ...partial },
    transaction: { message: { accountKeys: keys.map((pubkey) => ({ pubkey })) }, signatures: sigs },
  };
}

describe('parseSolanaTx', () => {
  it('réception : from = payeur, to = moi, montant = delta', () => {
    const t = tx({ fee: 5000, preBalances: [1_000_000_000, 0], postBalances: [700_000_000, 300_000_000] }, [OTHER, ME]);
    const r = parseSolanaTx(ME, t)!;
    expect(r.direction).toBe('in');
    expect(r.from).toBe(OTHER);
    expect(r.to).toBe(ME);
    expect(r.value).toBe(300_000_000n);
    expect(r.status).toBe('success');
    expect(r.hash).toBe('sig1');
  });

  it('envoi (moi payeur) : montant exclut les frais', () => {
    // ME index 0 (payeur) : pre 1e9, post 698e6 → delta -302_000_000, dont 5000 de frais.
    const t = tx({ fee: 5000, preBalances: [1_000_000_000, 0], postBalances: [698_000_000, 302_000_000 - 5000] }, [ME, OTHER]);
    // post OTHER = montant reçu ; ajustons pour cohérence : OTHER gagne 301_995_000.
    const r = parseSolanaTx(ME, {
      ...t,
      meta: { err: null, fee: 5000, preBalances: [1_000_000_000, 0], postBalances: [698_000_000, 301_995_000] },
    })!;
    expect(r.direction).toBe('out');
    expect(r.from).toBe(ME);
    expect(r.to).toBe(OTHER);
    // delta ME = -302_000_000 ; montant = 302_000_000 - 5000 (frais) = 301_995_000.
    expect(r.value).toBe(301_995_000n);
  });

  it('échec de transaction → status failed', () => {
    const t = tx({ err: { InstructionError: [0, 'Custom'] }, preBalances: [1_000_000_000, 0], postBalances: [999_995_000, 0] }, [ME, OTHER]);
    const r = parseSolanaTx(ME, t)!;
    expect(r.status).toBe('failed');
  });

  it('adresse absente → null', () => {
    const t = tx({ preBalances: [1, 2], postBalances: [1, 2] }, [OTHER, 'ZZZ']);
    expect(parseSolanaTx(ME, t)).toBeNull();
  });

  it('structure incomplète → null', () => {
    expect(parseSolanaTx(ME, { transaction: { message: { accountKeys: [] } } })).toBeNull();
  });
});
