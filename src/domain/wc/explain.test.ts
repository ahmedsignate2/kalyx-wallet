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

describe('Permit2 et Solana (régressions)', () => {
  it('Permit2 : nomme le vrai token, jamais « Permit2 »', () => {
    const typed = {
      name: 'Permit2',
      primaryType: 'PermitSingle',
      chainId: 56,
      token: '0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d',
      amountRaw: (2n ** 160n - 1n).toString(),
      unlimited: true,
      permit2: true,
      details: [
        { label: 'Autorisé (spender)', value: '0x8b84bd1b8dbc1c9f0d1e6b0000000000000001e6b' },
        { label: 'Token', value: '0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d' },
        { label: 'Montant', value: 'Illimité ⚠️' },
      ],
    };
    const withSymbol = explainRequest({ kind: 'typedData', domain: 'app.uniswap.org', typed, tokenSymbol: 'USDC', tokenDecimals: 18 });
    expect(withSymbol.headline).toContain('un montant illimité de tes USDC (via Permit2)');
    expect(withSymbol.headline).not.toContain('tes Permit2');
    expect(withSymbol.risk).toBe('danger');
    const noSymbol = explainRequest({ kind: 'typedData', domain: 'app.uniswap.org', typed });
    expect(noSymbol.headline).not.toContain('tes Permit2');
    expect(noSymbol.headline).toContain('(via Permit2)');
  });

  it('Permit EIP-2612 classique : le nom du domaine est bien le token', () => {
    const typed = { name: 'USD Coin', primaryType: 'Permit', token: '0xA0b8...', amountRaw: '1000000', unlimited: false, permit2: false, details: [{ label: 'Autorisé (spender)', value: '0xspender' }] };
    const e = explainRequest({ kind: 'typedData', domain: 'x.io', typed, tokenDecimals: 6 });
    expect(e.headline).toContain('jusqu’à 1 tes USD Coin');
  });

  it('Solana : un swap Jupiter est expliqué comme un swap', () => {
    const e = explainRequest({ kind: 'solanaTx', method: 'solana_signTransaction', domain: 'jup.ag', solana: { version: 0, programs: [], known: ['Jupiter v6', 'Compute Budget'], dapp: 'Jupiter v6', action: 'swap', instructions: 4, feePayer: 'x', lookupTables: 2, feePayerMismatch: false } });
    expect(e.title).toBe('Swap');
    expect(e.headline).toContain('via Jupiter v6');
    expect(e.risk).toBe('none');
    const bad = explainRequest({ kind: 'solanaTx', domain: 'jup.ag', solana: { version: 0, programs: [], known: [], dapp: null, action: 'contract', instructions: 1, feePayer: 'y', lookupTables: 0, feePayerMismatch: true } });
    expect(bad.risk).toBe('warning'); // programme inconnu
    const sponsored = explainRequest({ kind: 'solanaTx', domain: 'jup.ag', solana: { version: 0, programs: [], known: ['Jupiter v6'], dapp: 'Jupiter v6', action: 'swap', instructions: 4, feePayer: '7rhxnLV8C77o6d8oz26AgK8x8m5ePsdeRawjqvojbjnQ', lookupTables: 2, feePayerMismatch: true } });
    expect(sponsored.risk).toBe('none');
    expect(sponsored.detail).toContain('payés par la dApp');
  });
});

describe('Bitcoin et messages (WalletConnect)', () => {
  it('lecture d’adresses : aucun risque, pas de maintien', () => {
    const e = explainRequest({ kind: 'btcAccounts', domain: 'app.test' });
    expect(e.title).toBe('Lecture');
    expect(e.risk).toBe('none');
    expect(e.holdToSign).toBe(false);
  });
  it('transfert : montant en BTC et destinataire court', () => {
    const e = explainRequest({ kind: 'btcTransfer', domain: 'app.test', btc: { to: 'bc1quc8glxvajh0c4ghv4htftk202ldx5h0u42hfyy', sats: 150000n } });
    expect(e.headline).toMatch(/0[.,]0015 BTC/);
    expect(e.lose[0]).toMatch(/0[.,]0015 BTC/);
    expect(e.risk).toBe('warning');
  });
  it('PSBT : entrées et diffusion', () => {
    const e = explainRequest({ kind: 'btcPsbt', domain: 'app.test', btc: { inputs: 2, broadcast: true } });
    expect(e.headline).toContain('2 entrées');
    expect(e.reasons.join(' ')).toContain('diffusée immédiatement');
  });
  it('message : aperçu du texte décodé', () => {
    const e = explainRequest({ kind: 'message', domain: 'app.test', messageText: 'This is a message to be signed for BIP122' });
    expect(e.detail).toContain('This is a message to be signed for BIP122');
  });
});
