import { explainRequest } from './explain';
import { decodeTx } from '../tx/decodeTx';

const SPENDER = '0x1231deb6f5749ef6ce6943a275a1d3e7486f4eae';
const approveUnlimited = '0x095ea7b3' + SPENDER.slice(2).padStart(64, '0') + 'f'.repeat(64);
const approveAll = '0xa22cb465' + SPENDER.slice(2).padStart(64, '0') + '1'.padStart(64, '0');

describe('explainRequest', () => {
  it('SIWE : connexion, aucun frais, risque none', () => {
    const e = explainRequest({ kind: 'siwe', domain: 'app.uniswap.org', siwe: { domain: 'app.uniswap.org' } as any });
    expect(e.title).toBe('Connexion');
    expect(e.headline).toContain('app.uniswap.org');
    expect(e.risk).toBe('none');
    expect(e.holdToSign).toBe(false);
  });
  it('SIWE avec domaine différent → danger', () => {
    const e = explainRequest({ kind: 'siwe', domain: 'evil.com', siwe: { domain: 'app.uniswap.org' } as any, siweMismatch: true });
    expect(e.risk).toBe('danger');
    expect(e.holdToSign).toBe(true);
  });
  it('Permit illimité sans expiration → danger + réduire', () => {
    const e = explainRequest({ kind: 'typedData', domain: 'x.com', typed: { name: 'USD Coin', primaryType: 'Permit', details: [{ label: 'Autorisé (spender)', value: SPENDER }, { label: 'Montant', value: 'Illimité ⚠️' }, { label: 'Échéance', value: 'Sans expiration ⚠️' }] } });
    expect(e.title).toBe('Autorisation');
    expect(e.risk).toBe('danger');
    expect(e.canReduceApproval).toBe(true);
    expect(e.headline).toContain('illimité');
    expect(e.detail).toContain('clé');
  });
  it('Permit limité → warning', () => {
    const e = explainRequest({ kind: 'typedData', domain: 'x.com', typed: { name: 'USDC', primaryType: 'Permit', details: [{ label: 'Autorisé (spender)', value: SPENDER }, { label: 'Montant', value: '1000000000' }] } });
    expect(e.risk).toBe('warning');
    expect(e.canReduceApproval).toBe(false);
  });
  it('setApprovalForAll → danger, maintenir', () => {
    const e = explainRequest({ kind: 'tx', domain: 'x.com', decoded: decodeTx({ to: '0xnft', data: approveAll }) });
    expect(e.risk).toBe('danger');
    expect(e.holdToSign).toBe(true);
    expect(e.headline).toContain('tous tes NFT');
  });
  it('approve illimité → warning + réduire', () => {
    const e = explainRequest({ kind: 'tx', domain: 'x.com', decoded: decodeTx({ to: '0xtoken', data: approveUnlimited }) });
    expect(e.risk).toBe('warning');
    expect(e.canReduceApproval).toBe(true);
  });
  it('swap simulé → « Tu vas échanger 50 USDC contre environ 0.02 ETH »', () => {
    const e = explainRequest({ kind: 'tx', domain: 'app.uniswap.org', decoded: decodeTx({ to: '0xrouter', data: '0xdeadbeef00' }), simulation: { source: 'alchemy', approvals: [], changes: [
      { direction: 'out', assetType: 'ERC20', symbol: 'USDC', rawAmount: '50000000', decimals: 6 },
      { direction: 'in', assetType: 'NATIVE', symbol: 'ETH', rawAmount: '20000000000000000', decimals: 18 },
    ] } });
    expect(e.headline).toBe('Tu vas échanger 50 USDC contre environ 0.02 ETH.');
    expect(e.lose).toEqual(['50 USDC']);
    expect(e.receive).toEqual(['0.02 ETH']);
    expect(e.risk).toBe('none');
  });
  it('site frauduleux (Verify) → danger quel que soit le contenu', () => {
    const e = explainRequest({ kind: 'message', domain: 'x.com', verify: { isScam: true } });
    expect(e.risk).toBe('danger');
    expect(e.reasons[0]).toContain('frauduleux');
  });
  it('méthode inconnue → warning, conseil de refuser', () => {
    const e = explainRequest({ kind: 'other', method: 'eth_weird' });
    expect(e.risk).toBe('warning');
    expect(e.detail).toContain('refuse');
  });
});
