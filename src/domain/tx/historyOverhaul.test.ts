import { parseAlchemyHistory, alchemyTransfersBody, alchemyCategories } from '../chains/alchemy';
import { spamReason, knownCounterparties, looksLike, isScamName, type SpamCtx } from './spam';
import { humanizeTx } from './humanize';
import type { TxSummary } from '../chains/types';

const ME = '0x84e90b03e29c28b22c645ad6c0badc9574995eb3';
const DEX = '0x1111111254eeb25477b68fb85ed929f73a960582';
const USDC = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913';
const BASENAMES = '0x03c4738ee98ae44591e1a4a4f3cab6641d95dd9a';
const FRIEND = '0xabcd000000000000000000000000000000001234';
const SOSIE = '0xabcdffffffffffffffffffffffffffffffff1234';

const transfer = (o: Record<string, unknown>) => ({ metadata: { blockTimestamp: '2026-09-27T10:00:00.000Z' }, blockNum: '0x10', ...o });

describe('Alchemy : requête', () => {
  it('les plus récents d’abord, NFT compris ; « internal » seulement là où il existe', () => {
    const body = JSON.parse(alchemyTransfersBody(ME, 'to', 'base'));
    expect(body.params[0]).toMatchObject({ toAddress: ME, order: 'desc', category: ['external', 'erc20', 'erc721', 'erc1155'] });
    expect(alchemyCategories('ethereum')).toContain('internal');
    expect(alchemyCategories('base')).not.toContain('internal');
  });
});

describe('Alchemy : analyse', () => {
  const sent = { result: { transfers: [
    transfer({ uniqueId: 'a:1', hash: '0xswap', from: ME, to: DEX, category: 'erc20', asset: 'USDC', rawContract: { value: '0x5f5e100', address: USDC, decimal: '0x6' } }),
    transfer({ uniqueId: 'a:2', hash: '0xswap', from: ME, to: DEX, category: 'external', asset: 'ETH', rawContract: { value: '0x0' } }),
    transfer({ uniqueId: 'c:1', hash: '0xpay', from: ME, to: FRIEND, category: 'external', asset: 'ETH', rawContract: { value: '0xde0b6b3a7640000' }, metadata: { blockTimestamp: '2026-09-26T10:00:00.000Z' } }),
  ] } };
  const received = { result: { transfers: [
    transfer({ uniqueId: 'a:3', hash: '0xswap', from: DEX, to: ME, category: 'internal', asset: 'ETH', rawContract: { value: '0x6a94d74f430000' } }),
    transfer({ uniqueId: 'b:1', hash: '0xname', from: '0x0000000000000000000000000000000000000000', to: ME, category: 'erc721', asset: 'BASENAME', erc721TokenId: '0x2a', rawContract: { address: BASENAMES }, metadata: { blockTimestamp: '2026-09-27T11:00:00.000Z' } }),
  ] } };
  const txs = parseAlchemyHistory([received, sent], ME);

  it('un swap = UNE ligne, avec ses deux jambes (et sans la jambe native à 0)', () => {
    const swap = txs.find((t) => t.hash === '0xswap')!;
    expect(swap).toMatchObject({ type: 'SWAP', direction: 'out', asset: 'USDC', value: 100_000_000n, decimals: 6, contract: USDC });
    expect(swap.legs).toEqual([
      { direction: 'in', value: 30_000_000_000_000_000n },
      { direction: 'out', value: 100_000_000n, asset: 'USDC', contract: USDC, decimals: 6 },
    ]);
  });

  it('un Basename reçu apparaît (NFT, identifiant décimal)', () => {
    expect(txs.find((t) => t.hash === '0xname')).toMatchObject({ type: 'NFT', direction: 'in', tokenId: '42', contract: BASENAMES, value: 1n });
  });

  it('du plus récent au plus ancien', () => {
    expect(txs.map((t) => t.hash)).toEqual(['0xname', '0xswap', '0xpay']);
  });

  it('humanisé : « Échangé 100 USDC → 0,03 ETH », reçu en vert, sorti en second', () => {
    const t = (k: string, p?: Record<string, string>) => `${k}${p ? JSON.stringify(p) : ''}`;
    const h = humanizeTx({ ...txs.find((x) => x.hash === '0xswap')!, chain: 'base' }, { t: t as never, nativeSymbol: 'ETH', nativeDecimals: 18 });
    expect(h.label).toBe('actLabelSwapped');
    expect(h.amount).toBe('+0.03 ETH');
    expect(h.amountAlt).toBe('−100 USDC');
    expect(h.tone).toBe('up');
  });
});

describe('Anti-spam', () => {
  const tx = (o: Partial<TxSummary>): TxSummary => ({ chain: 'base', hash: '0x' + Math.random(), from: FRIEND, to: ME, value: 1n, timestamp: 1, direction: 'in', status: 'success', ...o });
  const trusted: SpamCtx['trusted'] = (_c, a) => a.toLowerCase() === USDC;
  const history = [tx({ direction: 'out', from: ME, to: FRIEND, value: 10n ** 18n })];
  const ctx: SpamCtx = { trusted, known: knownCounterparties(history, trusted, [ME]) };

  it('reconnaît les sosies et les noms publicitaires', () => {
    expect(looksLike(FRIEND, SOSIE)).toBe(true);
    expect(looksLike(FRIEND, FRIEND)).toBe(false);
    expect(isScamName('Visit usdc-reward.com to claim')).toBe(true);
    expect(isScamName('$ 5000 USDT')).toBe(true);
    expect(isScamName('USDC')).toBe(false);
  });

  it('empoisonnement : 0 depuis un sosie d’un destinataire réel', () => {
    expect(spamReason(tx({ from: SOSIE, value: 0n, contract: USDC, asset: 'USDC', type: 'TRANSFER' }), ctx)).toBe('poisoning');
    // … même avec une poussière non nulle, en monnaie native.
    expect(spamReason(tx({ from: SOSIE, value: 1n }), ctx)).toBe('poisoning');
  });

  it('faux USDC : même symbole, autre contrat → non vérifié', () => {
    expect(spamReason(tx({ contract: '0xdead00000000000000000000000000000000beef', asset: 'USDC', type: 'TRANSFER' }), ctx)).toBe('unverifiedToken');
    expect(spamReason(tx({ contract: USDC, asset: 'USDC', type: 'TRANSFER' }), ctx)).toBeNull();
  });

  it('transfert de token à 0, nom publicitaire', () => {
    expect(spamReason(tx({ contract: USDC, asset: 'USDC', type: 'TRANSFER', value: 0n }), ctx)).toBe('zeroValue');
    expect(spamReason(tx({ contract: USDC, asset: 'claim-rewards.io', type: 'TRANSFER' }), ctx)).toBe('scamName');
  });

  it('jamais du spam : ses swaps, ses envois réels, un NFT reçu d’une collection', () => {
    expect(spamReason(tx({ type: 'SWAP', direction: 'out', from: ME, to: DEX, contract: '0xdead00000000000000000000000000000000beef' }), ctx)).toBeNull();
    expect(spamReason(history[0], ctx)).toBeNull();
    expect(spamReason(tx({ type: 'NFT', contract: BASENAMES }), ctx)).toBeNull();
  });

  it('un faux transfert « de toi » émis par un faux token ne rend pas son destinataire « connu »', () => {
    const fake = tx({ direction: 'out', from: ME, to: SOSIE, value: 5n, contract: '0xdead00000000000000000000000000000000beef', type: 'TRANSFER' });
    expect(knownCounterparties([fake], trusted).has(SOSIE)).toBe(false);
  });
});
