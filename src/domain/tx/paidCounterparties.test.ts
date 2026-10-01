import { paidCounterparties } from './spam';

describe('paidCounterparties', () => {
  const base = { chain: 'solana', hash: 'h', from: 'me', value: 1n, timestamp: 1, direction: 'out' as const, status: 'success' as const };
  it('garde la casse des adresses Solana, normalise EVM, ignore échecs et NFT', () => {
    const out = paidCounterparties(
      [
        { ...base, to: '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU' },
        { ...base, chain: 'ethereum', to: '0x28C6c06298d514Db089934071355E5743bf21d60' },
        { ...base, chain: 'ethereum', to: '0x28c6c06298d514db089934071355e5743bf21d60' },
        { ...base, to: 'FAILED', status: 'failed' as const },
        { ...base, to: 'NFT', type: 'NFT' },
      ],
      () => true,
    );
    expect(out).toContain('7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU');
    expect(out.filter((a) => a.toLowerCase() === '0x28c6c06298d514db089934071355e5743bf21d60')).toHaveLength(1);
    expect(out).not.toContain('FAILED');
    expect(out).not.toContain('NFT');
  });
});
