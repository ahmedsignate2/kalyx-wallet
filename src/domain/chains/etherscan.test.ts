import { parseTxList } from './etherscan';

const OWNER = '0x9858EfFD232B4033E47d90003D41EC34EcaEda94';
const OTHER = '0x1111111111111111111111111111111111111111';

const sample = {
  status: '1',
  message: 'OK',
  result: [
    {
      hash: '0xaaa',
      from: OTHER,
      to: OWNER,
      value: '1000000000000000000', // 1 ETH reçu
      timeStamp: '1700000000',
      isError: '0',
      txreceipt_status: '1',
    },
    {
      hash: '0xbbb',
      from: OWNER,
      to: OTHER,
      value: '500000000000000000', // 0.5 ETH envoyé
      timeStamp: '1700000100',
      isError: '0',
      txreceipt_status: '1',
    },
    {
      hash: '0xccc',
      from: OWNER,
      to: OTHER,
      value: '0',
      timeStamp: '1700000200',
      isError: '1', // échouée
      txreceipt_status: '0',
    },
  ],
};

describe('parseTxList (Etherscan-like)', () => {
  it('normalise et déduit la direction', () => {
    const txs = parseTxList(sample, OWNER);
    expect(txs).toHaveLength(3);
    expect(txs[0]).toMatchObject({ hash: '0xaaa', direction: 'in', status: 'success' });
    expect(txs[0].value).toBe(10n ** 18n);
    expect(txs[1]).toMatchObject({ direction: 'out', status: 'success' });
    expect(txs[2]).toMatchObject({ direction: 'out', status: 'failed' });
    expect(txs[0].timestamp).toBe(1700000000);
  });

  it('détecte un self-transfer', () => {
    const txs = parseTxList(
      { status: '1', result: [{ hash: '0xd', from: OWNER, to: OWNER, value: '1', timeStamp: '1' }] },
      OWNER,
    );
    expect(txs[0].direction).toBe('self');
  });

  it('renvoie [] sur réponse d’erreur (clé API manquante / rate limit)', () => {
    expect(parseTxList({ status: '0', message: 'NOTOK', result: 'Missing API Key' }, OWNER)).toEqual([]);
    expect(parseTxList(null, OWNER)).toEqual([]);
    expect(parseTxList({}, OWNER)).toEqual([]);
  });

  it('ne casse pas sur une valeur non parsable', () => {
    const txs = parseTxList(
      { status: '1', result: [{ hash: '0xe', from: OTHER, to: OWNER, value: 'xxx', timeStamp: 'yyy' }] },
      OWNER,
    );
    expect(txs[0].value).toBe(0n);
    expect(txs[0].timestamp).toBe(0);
  });
});
