import {
  parseTokenAccounts,
  mergeTokenAccounts,
  SPL_TOKEN_PROGRAM,
  SPL_TOKEN_2022_PROGRAM,
  type SplToken,
} from './splTokens';

function acc(mint: string, amount: string, decimals: number, pubkey = 'ata1') {
  return { pubkey, account: { data: { parsed: { info: { mint, tokenAmount: { amount, decimals } } } } } };
}

describe('parseTokenAccounts', () => {
  it('mappe un mint connu vers son symbole', () => {
    const r = parseTokenAccounts([acc('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', '1500000', 6)]);
    expect(r).toHaveLength(1);
    expect(r[0].symbol).toBe('USDC');
    expect(r[0].raw).toBe(1_500_000n);
    expect(r[0].decimals).toBe(6);
    expect(r[0].ata).toBe('ata1');
  });

  it('masque les comptes à solde nul', () => {
    const r = parseTokenAccounts([acc('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', '0', 6)]);
    expect(r).toHaveLength(0);
  });

  it('mint inconnu → symbole tronqué + nom générique', () => {
    const r = parseTokenAccounts([acc('So11111111111111111111111111111111111111112', '42', 9)]);
    expect(r[0].symbol).toBe('So11…');
    expect(r[0].name).toBe('Token SPL');
  });

  it('trie par solde décroissant', () => {
    const r = parseTokenAccounts([
      acc('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', '10', 6, 'a'),
      acc('Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', '99', 6, 'b'),
    ]);
    expect(r[0].symbol).toBe('USDT');
    expect(r[1].symbol).toBe('USDC');
  });

  it('entrée malformée ignorée', () => {
    expect(parseTokenAccounts([{ account: {} }, null as never])).toHaveLength(0);
    expect(parseTokenAccounts(undefined)).toHaveLength(0);
  });
});

describe('Token-2022 : programme propriétaire', () => {
  const acc = (mint: string, amount: string, owner?: string) => ({
    pubkey: `ata-${mint}`,
    account: {
      ...(owner ? { owner } : {}),
      data: { parsed: { info: { mint, tokenAmount: { amount, decimals: 6 } } } },
    },
  });

  it('retient le programme annoncé par le RPC', () => {
    // Sans lui, on ne peut pas renvoyer un jeton qu'on vient d'afficher : le
    // programme entre dans les seeds de l'ATA et dans l'instruction.
    const [t] = parseTokenAccounts([acc('MintA', '5', SPL_TOKEN_2022_PROGRAM)] as never);
    expect(t.programId).toBe(SPL_TOKEN_2022_PROGRAM);
  });

  it('retombe sur le programme interrogé si le RPC ne l\'expose pas', () => {
    const [t] = parseTokenAccounts([acc('MintB', '5')] as never, SPL_TOKEN_2022_PROGRAM);
    expect(t.programId).toBe(SPL_TOKEN_2022_PROGRAM);
  });

  it('par défaut, le programme historique', () => {
    const [t] = parseTokenAccounts([acc('MintC', '5')] as never);
    expect(t.programId).toBe(SPL_TOKEN_PROGRAM);
  });
});

describe('mergeTokenAccounts', () => {
  const tok = (mint: string, raw: bigint, programId: string): SplToken => ({
    mint, ata: `ata-${mint}`, raw, decimals: 6, symbol: mint, name: mint, programId,
  });

  it('réunit les jetons des deux programmes', () => {
    const merged = mergeTokenAccounts(
      [tok('Legacy', 10n, SPL_TOKEN_PROGRAM)],
      [tok('New', 20n, SPL_TOKEN_2022_PROGRAM)],
    );
    expect(merged.map((t) => t.mint)).toEqual(['New', 'Legacy']); // tri par solde
  });

  it('ne double PAS un mint renvoyé deux fois', () => {
    // Un mint n'appartient qu'à un programme ; un RPC bavard ne doit pas
    // doubler le solde affiché.
    const merged = mergeTokenAccounts(
      [tok('Same', 10n, SPL_TOKEN_PROGRAM)],
      [tok('Same', 10n, SPL_TOKEN_2022_PROGRAM)],
    );
    expect(merged).toHaveLength(1);
    expect(merged[0].programId).toBe(SPL_TOKEN_PROGRAM); // la première gagne
  });

  it('une liste vide ne casse rien', () => {
    expect(mergeTokenAccounts([], [])).toEqual([]);
  });
});
