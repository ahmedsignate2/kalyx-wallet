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

describe('parseSolanaTx — transferts de JETONS', () => {
  const ME = 'MoiMoiMoiMoiMoiMoiMoiMoiMoiMoiMoi';
  const AUTRE = 'AutreAutreAutreAutreAutreAutreAutre';
  const USDC = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
  const BONK = 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263';

  const bal = (accountIndex: number, mint: string, owner: string, amount: string, decimals = 6) => ({
    accountIndex,
    mint,
    owner,
    uiTokenAmount: { amount, decimals },
  });

  /** Transaction où seuls les jetons bougent, les lamports ne payant que les frais. */
  const tokenTx = (pre: unknown[], post: unknown[], lamportDelta = -5000) => ({
    blockTime: 1_700_000_000,
    meta: {
      err: null,
      fee: 5000,
      preBalances: [1_000_000, 0],
      postBalances: [1_000_000 + lamportDelta, 0],
      preTokenBalances: pre,
      postTokenBalances: post,
    },
    transaction: { message: { accountKeys: [{ pubkey: ME }, { pubkey: AUTRE }] }, signatures: ['SIG'] },
  });

  it('un envoi d\'USDC est vu comme un envoi d\'USDC, pas comme 0 SOL', () => {
    /*
     * C'était le bug : seuls les lamports étaient lus, donc envoyer 100 USDC
     * produisait une ligne à ~0 SOL avec un destinataire arbitraire.
     */
    const tx = tokenTx(
      [bal(1, USDC, ME, '100000000'), bal(2, USDC, AUTRE, '0')],
      [bal(1, USDC, ME, '0'), bal(2, USDC, AUTRE, '100000000')],
    );
    const r = parseSolanaTx(ME, tx as never)!;
    expect(r.direction).toBe('out');
    expect(r.value).toBe(100_000_000n);
    expect(r.asset).toBe('USDC');
    expect(r.decimals).toBe(6);
    expect(r.to).toBe(AUTRE);
    expect(r.type).toBe('TRANSFER');
  });

  it('une réception d\'USDC : sens entrant et contrepartie correcte', () => {
    const tx = tokenTx(
      [bal(1, USDC, ME, '0'), bal(2, USDC, AUTRE, '50000000')],
      [bal(1, USDC, ME, '50000000'), bal(2, USDC, AUTRE, '0')],
    );
    const r = parseSolanaTx(ME, tx as never)!;
    expect(r.direction).toBe('in');
    expect(r.value).toBe(50_000_000n);
    expect(r.from).toBe(AUTRE);
  });

  it('deux jetons qui bougent = un ÉCHANGE, et on garde le plus gros', () => {
    const tx = tokenTx(
      [bal(1, USDC, ME, '10000000'), bal(3, BONK, ME, '0', 5)],
      [bal(1, USDC, ME, '0'), bal(3, BONK, ME, '999999999', 5)],
    );
    const r = parseSolanaTx(ME, tx as never)!;
    expect(r.type).toBe('SWAP');
    expect(r.value).toBe(999_999_999n); // le mouvement dominant
    expect(r.asset).toBe('BONK');
  });

  it('additionne plusieurs comptes du MÊME mint', () => {
    // Un propriétaire peut détenir plusieurs comptes pour un mint : ne regarder
    // que le premier sous-estimerait le mouvement réel de son solde.
    const tx = tokenTx(
      [bal(1, USDC, ME, '60000000'), bal(4, USDC, ME, '40000000')],
      [bal(1, USDC, ME, '0'), bal(4, USDC, ME, '0')],
    );
    const r = parseSolanaTx(ME, tx as never)!;
    expect(r.value).toBe(100_000_000n);
  });

  it('ignore les soldes des AUTRES propriétaires pour notre delta', () => {
    const tx = tokenTx(
      [bal(2, USDC, AUTRE, '999999999')],
      [bal(2, USDC, AUTRE, '0')],
    );
    // Aucun mouvement chez nous → on retombe sur la lecture en lamports.
    const r = parseSolanaTx(ME, tx as never)!;
    expect(r.asset).toBeUndefined();
  });

  it('un mint inconnu reste lisible, mint tronqué', () => {
    const MINT = 'ZzZzZzZzZzZzZzZzZzZzZzZzZzZzZzZzZzZz';
    const tx = tokenTx(
      [bal(1, MINT, ME, '7', 9)],
      [bal(1, MINT, ME, '0', 9)],
    );
    const r = parseSolanaTx(ME, tx as never)!;
    expect(r.asset).toBe('ZzZz…');
    expect(r.decimals).toBe(9);
  });

  it('un montant illisible n\'invente pas de mouvement', () => {
    const tx = tokenTx(
      [{ accountIndex: 1, mint: USDC, owner: ME, uiTokenAmount: { amount: 'pas-un-nombre', decimals: 6 } }],
      [bal(1, USDC, ME, '0')],
    );
    // Le solde `pre` est illisible : on ne fabrique pas un transfert à partir
    // de rien, on retombe sur les lamports.
    const r = parseSolanaTx(ME, tx as never)!;
    expect(r.asset).toBeUndefined();
  });

  it('un transfert de SOL pur reste traité en lamports', () => {
    const tx = {
      blockTime: 1,
      meta: { err: null, fee: 5000, preBalances: [1_000_000, 0], postBalances: [500_000, 495_000], preTokenBalances: [], postTokenBalances: [] },
      transaction: { message: { accountKeys: [{ pubkey: ME }, { pubkey: AUTRE }] }, signatures: ['S'] },
    };
    const r = parseSolanaTx(ME, tx as never)!;
    expect(r.asset).toBeUndefined();
    expect(r.direction).toBe('out');
  });
});
