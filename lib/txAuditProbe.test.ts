jest.mock('../src', () => {
  const actual = jest.requireActual('../src');
  return { ...actual, getAdapter: jest.fn(), assessAddress: jest.fn() };
});
import { assessAddress, getAdapter, formatTonAddress, parseTonAddress, type TxSummary } from '../src';
import { addressKey, probeRecipient, profileFromHistory, relationFromHistory, sameAddress } from './txAuditProbe';

const tx = (p: Partial<TxSummary>): TxSummary => ({ chain: 'ethereum', hash: 'h', from: '', to: '', value: 1n, timestamp: 1_700_000_000, direction: 'out', status: 'success', ...p });

describe('égalité d’adresses', () => {
  it('EVM : insensible à la casse', () => {
    expect(sameAddress('0xAbC0000000000000000000000000000000000001', '0xabc0000000000000000000000000000000000001')).toBe(true);
  });
  it('TON : EQ… et UQ… désignent la même adresse', () => {
    const eq = 'EQCD39VS5jcptHL8vMjEXrzGaRcCVYto7HUn4bpAOg8xqB2N';
    const parsed = parseTonAddress(eq)!;
    const uq = formatTonAddress(parsed, { bounceable: false });
    expect(uq).not.toBe(eq);
    expect(sameAddress(eq, uq)).toBe(true);
    expect(addressKey(uq)).toMatch(/^0:[0-9a-f]{64}$/);
  });
});

describe('relation avec l’adresse', () => {
  it('compte les paiements réussis, la date du dernier, et les réceptions', () => {
    const r = relationFromHistory([
      tx({ to: '0xBob', timestamp: 100 }),
      tx({ to: '0xbob', timestamp: 300 }),
      tx({ to: '0xbob', status: 'failed', timestamp: 400 }),
      tx({ direction: 'in', from: '0xBOB' }),
      tx({ to: '0xalice' }),
    ], '0xbob');
    expect(r).toEqual({ paidCount: 2, lastPaidAt: 300, receivedCount: 1 });
  });
});

describe('profil public', () => {
  it('adresse vide', () => {
    expect(profileFromHistory([])).toMatchObject({ txCount: 0, capped: false, distinctSenders: 0 });
  });
  it('expéditeurs distincts et page pleine', () => {
    const txs = Array.from({ length: 20 }, (_, i) => tx({ direction: 'in', from: `0x${i % 5}`, timestamp: 1000 + i }));
    expect(profileFromHistory(txs)).toMatchObject({ txCount: 20, capped: true, distinctSenders: 5, inCount: 20, oldestSeenAt: 1000 });
  });
});

describe('probeRecipient', () => {
  it('relit les deux historiques et la liste noire, sans jamais lever', async () => {
    (getAdapter as jest.Mock).mockReturnValue({
      config: { family: 'evm', evmChainId: 1 },
      getHistory: jest.fn(async (a: string) => (a === '0xme' ? [tx({ to: '0xbob' })] : Promise.reject(new Error('indexeur hors service')))),
    });
    (assessAddress as jest.Mock).mockResolvedValue({ level: 'danger', reasons: ['gpPhishing'] });
    const p = await probeRecipient('ethereum', '0xme', '0xbob', 200);
    expect(p.history).toEqual({ paidCount: 1, lastPaidAt: 1_700_000_000, receivedCount: 0 });
    expect(p.profile).toBeUndefined();
    expect(p.flags).toEqual(['gpPhishing']);
  });
});

describe('historique vide', () => {
  it('n’affirme « adresse neuve » que si le solde est nul aussi', async () => {
    const base = { config: { family: 'solana' }, getHistory: jest.fn(async () => []) };
    (getAdapter as jest.Mock).mockReturnValue({ ...base, getBalance: jest.fn(async () => ({ raw: 5n, decimals: 9, symbol: 'SOL' })) });
    expect((await probeRecipient('solana', undefined, 'X', 200)).profile).toBeUndefined();
    (getAdapter as jest.Mock).mockReturnValue({ ...base, getBalance: jest.fn(async () => ({ raw: 0n, decimals: 9, symbol: 'SOL' })) });
    expect((await probeRecipient('solana', undefined, 'X', 200)).profile?.txCount).toBe(0);
  });
});
