import { transactionsToCsv } from './txCsv';
import type { TxSummary } from '../chains/types';

const ctx = { chainName: 'Ethereum', nativeSymbol: 'ETH', nativeDecimals: 18, explorerUrl: 'https://etherscan.io' };

const tx = (o: Partial<TxSummary>): TxSummary => ({
  hash: '0xabc',
  from: '0xFrom',
  to: '0xTo',
  value: 10n ** 18n,
  timestamp: 1893456000, // 2030-01-01 00:00:00 UTC
  direction: 'out',
  status: 'success',
  ...o,
});

describe('transactionsToCsv', () => {
  it('produit un en-tête + une ligne correcte', () => {
    const csv = transactionsToCsv([tx({})], ctx);
    const [header, row] = csv.split('\r\n');
    expect(header).toContain('Date (UTC)');
    expect(row).toBe('2030-01-01 00:00:00,Ethereum,Envoyé,1.0,ETH,0xFrom,0xTo,Confirmée,0xabc,https://etherscan.io/tx/0xabc');
  });

  it('sens et statut : reçu / échouée', () => {
    const csv = transactionsToCsv([tx({ direction: 'in', status: 'failed', value: 0n })], ctx);
    const row = csv.split('\r\n')[1];
    expect(row).toContain('Reçu');
    expect(row).toContain('Échouée');
    expect(row).toContain('0.0'); // montant 0
  });

  it('échappe les champs contenant une virgule/guillemet', () => {
    const csv = transactionsToCsv([tx({ from: 'a,b' })], { ...ctx, chainName: 'Base "L2"' });
    const row = csv.split('\r\n')[1];
    expect(row).toContain('"a,b"');
    expect(row).toContain('"Base ""L2"""');
  });

  it('liste vide → juste l’en-tête', () => {
    expect(transactionsToCsv([], ctx).split('\r\n')).toHaveLength(1);
  });
});
