import { parseTokenAccounts } from './splTokens';

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
