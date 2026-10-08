import { transactionsToCsv } from './txCsv';
import type { TxSummary } from '../chains/types';

const ctx = { chainName: 'Ethereum', nativeSymbol: 'ETH', nativeDecimals: 18, explorerUrl: 'https://etherscan.io' };

const tx = (o: Partial<TxSummary>): TxSummary => ({
  chain: 'ethereum',
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

  it('neutralise les formules (jeton spam nommé « =HYPERLINK(…) »)', () => {
    const csv = transactionsToCsv([tx({ asset: '=HYPERLINK("http://x","clic")', from: '@SUM(A1)', to: '+1+1' })], ctx);
    const row = csv.split('\r\n')[1];
    expect(row).toContain(`"'=HYPERLINK(""http://x"",""clic"")"`);
    expect(row).toContain("'@SUM(A1)");
    expect(row).toContain("'+1+1");
    // Un vrai nombre négatif reste un nombre ; un « - » suivi de texte est neutralisé.
    const neg = transactionsToCsv([tx({ asset: '-2+3', from: '-12.5' })], ctx).split('\r\n')[1];
    expect(neg).toContain("'-2+3");
    expect(neg).toContain(',-12.5,');
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

describe('transactionsToCsv — plusieurs réseaux dans un même fichier', () => {
  const META: Record<string, { name: string; nativeSymbol: string; nativeDecimals: number; explorerUrl?: string }> = {
    ethereum: { name: 'Ethereum', nativeSymbol: 'ETH', nativeDecimals: 18, explorerUrl: 'https://etherscan.io' },
    bitcoin: { name: 'Bitcoin', nativeSymbol: 'BTC', nativeDecimals: 8, explorerUrl: 'https://mempool.space' },
  };
  const multi = { ...ctx, chainOf: (c: string) => META[c] };

  /*
   * LE DÉFAUT CORRIGÉ. Toutes les lignes héritaient du réseau affiché : un export
   * lancé depuis Ethereum annonçait « Ethereum » et « ETH » pour du Bitcoin, avec
   * un lien etherscan inexploitable et un montant divisé par 10^18 au lieu de
   * 10^8. Un fichier destiné à la comptabilité ne peut pas se tromper là-dessus.
   */
  it('chaque ligne porte son réseau, son symbole et ses décimales', () => {
    const csv = transactionsToCsv(
      [tx({ chain: 'bitcoin', hash: 'btc1', value: 1_000n })],
      multi,
    );
    const row = csv.split('\r\n')[1];
    expect(row).toContain('Bitcoin');
    expect(row).toContain('BTC');
    expect(row).toContain('0.00001');
    expect(row).toContain('https://mempool.space/tx/btc1');
    expect(row).not.toContain('ETH');
  });

  /** L'actif de la transaction primait déjà à l'écran, jamais dans l'export. */
  it('un transfert de token sort avec SON symbole et SES décimales', () => {
    const csv = transactionsToCsv(
      [tx({ asset: 'USDC', decimals: 6, value: 2_500_000n })],
      multi,
    );
    const row = csv.split('\r\n')[1];
    expect(row).toContain('USDC');
    expect(row).toContain('2.5');
  });

  /** Une transaction en attente n'est pas confirmée : le dire autrement est faux. */
  it('une transaction en attente n’est pas annoncée confirmée', () => {
    const row = transactionsToCsv([tx({ status: 'pending' })], multi).split('\r\n')[1];
    expect(row).toContain('En attente');
    expect(row).not.toContain('Confirmée');
  });

  /** Chaîne retirée par l'utilisateur : on retombe sur le contexte, sans casser. */
  it('réseau inconnu : repli sur le contexte', () => {
    const row = transactionsToCsv([tx({ chain: 'reseau-retire' })], multi).split('\r\n')[1];
    expect(row).toContain('Ethereum');
    expect(row).toContain('ETH');
  });
});

describe('transactionsToCsv — nature de l’opération', () => {
  const row = (o: Partial<TxSummary>) => transactionsToCsv([tx(o)], ctx).split('\r\n')[1].split(',');
  it('NFT reçu sans nom de collection : « Reçu (NFT) », 1, « NFT #id » (et non « 1 ? »)', () => {
    const r = row({ direction: 'in', type: 'NFT', asset: '?', value: 1n, decimals: 0, tokenId: '42', from: '0x0000000000000000000000000000000000000000' });
    expect(r.slice(2, 5)).toEqual(['Reçu (NFT)', '1', 'NFT #42']);
  });
  it('appel de contrat à 0 et envoi de 0 à soi-même : « Interaction contrat »', () => {
    expect(row({ value: 0n }).slice(2, 4)).toEqual(['Interaction contrat', '0']);
    expect(row({ value: 0n, direction: 'self' }).slice(2, 4)).toEqual(['Interaction contrat', '0']);
    expect(row({ value: 0n, type: 'TRANSFER', asset: 'USDC', decimals: 6 })[2]).toBe('Envoyé');
  });
  it('date inconnue : case vide, jamais 1970', () => {
    expect(row({ timestamp: 0 })[0]).toBe('');
  });
});
