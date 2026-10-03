// `lib/i18n` tire React Native : mêmes simulations que `legal.test.ts`.
jest.mock('expo-localization', () => ({ getLocales: jest.fn(() => [{ languageCode: 'fr', languageTag: 'fr-FR', textDirection: 'ltr' }]) }));
jest.mock('react-native', () => ({ I18nManager: { isRTL: false, allowRTL: jest.fn(), forceRTL: jest.fn() }, Platform: { OS: 'ios' }, NativeModules: {} }));
jest.mock('@react-native-async-storage/async-storage', () => ({ getItem: jest.fn(), setItem: jest.fn() }));

import { explainRequest, type ExplainInput, type ExplainT } from './explain';
import { decodeTx } from '../tx/decodeTx';
import { translate, type Key } from '../../../lib/i18n';

const SPENDER = '0x1231deb6f5749ef6ce6943a275a1d3e7486f4eae';
const approveUnlimited = '0x095ea7b3' + SPENDER.slice(2).padStart(64, '0') + 'f'.repeat(64);
const approveAll = '0xa22cb465' + SPENDER.slice(2).padStart(64, '0') + '1'.padStart(64, '0');

/** Le traducteur de l'app, en français (comme l'écran le passe). */
const tr = (lang: 'fr' | 'en' | 'ko'): ExplainT => (k, p) => {
  let out = translate(lang, k as Key);
  for (const [a, b] of Object.entries(p ?? {})) out = out.split(`{${a}}`).join(b);
  return out;
};
const explain = (input: ExplainInput, lang: 'fr' | 'en' | 'ko' = 'fr') => explainRequest({ ...input, t: tr(lang) });

describe('explainRequest', () => {
  it('SIWE : connexion, aucun frais, risque none', () => {
    const e = explain({ kind: 'siwe', domain: 'app.uniswap.org', siwe: { domain: 'app.uniswap.org' } as any });
    expect(e.title).toBe('Connexion');
    expect(e.headline).toContain('app.uniswap.org');
    expect(e.risk).toBe('none');
    expect(e.holdToSign).toBe(false);
  });
  it('SIWE avec domaine différent → danger', () => {
    const e = explain({ kind: 'siwe', domain: 'evil.com', siwe: { domain: 'app.uniswap.org' } as any, siweMismatch: true });
    expect(e.risk).toBe('danger');
    expect(e.holdToSign).toBe(true);
    expect(e.reasons[0]).toContain('app.uniswap.org');
  });
  it('Permit illimité sans expiration → danger + réduire', () => {
    const e = explain({ kind: 'typedData', domain: 'x.com', typed: { name: 'USD Coin', primaryType: 'Permit', details: [{ label: 'Autorisé (spender)', value: SPENDER }, { label: 'Montant', value: 'Illimité ⚠️' }, { label: 'Échéance', value: 'Sans expiration ⚠️' }] } });
    expect(e.title).toBe('Autorisation');
    expect(e.risk).toBe('danger');
    expect(e.canReduceApproval).toBe(true);
    expect(e.headline).toContain('illimité');
    expect(e.detail).toContain('clé');
  });
  it('Permit limité → warning', () => {
    const e = explain({ kind: 'typedData', domain: 'x.com', typed: { name: 'USDC', primaryType: 'Permit', details: [{ label: 'Autorisé (spender)', value: SPENDER }, { label: 'Montant', value: '1000000000' }] } });
    expect(e.risk).toBe('warning');
    expect(e.canReduceApproval).toBe(false);
  });
  it('setApprovalForAll → danger, maintenir', () => {
    const e = explain({ kind: 'tx', domain: 'x.com', decoded: decodeTx({ to: '0xnft', data: approveAll }) });
    expect(e.risk).toBe('danger');
    expect(e.holdToSign).toBe(true);
    expect(e.headline).toContain('tous tes NFT');
  });
  it('simple envoi natif sans simulation (Sepolia) → montant connu, aucun signal de risque', () => {
    const to = '0x7411000000000000000000000000000000b69b00';
    const e = explain({ kind: 'tx', domain: 'app.kalyxwallet.com', decoded: decodeTx({ to, value: 10n ** 13n }), simulation: { source: 'static', approvals: [], changes: [], error: 'not supported' }, txValue: 10n ** 13n, nativeSymbol: 'ETH', nativeDecimals: 18 });
    expect(e.risk).toBe('none');
    expect(e.reasons).toEqual([]);
    expect(e.lose).toEqual(['0.00001 ETH']);
  });
  it('appel de contrat AVEC valeur, non simulé → toujours signalé', () => {
    const e = explain({ kind: 'tx', domain: 'x.com', decoded: decodeTx({ to: '0xrouter', value: 10n ** 13n, data: '0xdeadbeef00' }), simulation: { source: 'static', approvals: [], changes: [], error: 'x' }, txValue: 10n ** 13n, nativeSymbol: 'ETH', nativeDecimals: 18 });
    expect(e.risk).toBe('warning');
    expect(e.reasons.join(' ')).toContain('simulés');
  });
  it('approve illimité → warning + réduire', () => {
    const e = explain({ kind: 'tx', domain: 'x.com', decoded: decodeTx({ to: '0xtoken', data: approveUnlimited }) });
    expect(e.risk).toBe('warning');
    expect(e.canReduceApproval).toBe(true);
  });
  it('swap simulé → « Tu vas échanger 50 USDC contre environ 0.02 ETH »', () => {
    const e = explain({ kind: 'tx', domain: 'app.uniswap.org', decoded: decodeTx({ to: '0xrouter', data: '0xdeadbeef00' }), simulation: { source: 'alchemy', approvals: [], changes: [
      { direction: 'out', assetType: 'ERC20', symbol: 'USDC', rawAmount: '50000000', decimals: 6 },
      { direction: 'in', assetType: 'NATIVE', symbol: 'ETH', rawAmount: '20000000000000000', decimals: 18 },
    ] } });
    expect(e.headline).toBe('Tu vas échanger 50 USDC contre environ 0.02 ETH.');
    expect(e.lose).toEqual(['50 USDC']);
    expect(e.receive).toEqual(['0.02 ETH']);
    expect(e.risk).toBe('none');
  });
  it('site frauduleux (Verify) → danger quel que soit le contenu', () => {
    const e = explain({ kind: 'message', domain: 'x.com', verify: { isScam: true } });
    expect(e.risk).toBe('danger');
    expect(e.reasons[0]).toContain('frauduleux');
  });
  it('méthode inconnue → warning, conseil de refuser', () => {
    const e = explain({ kind: 'other', method: 'eth_weird' });
    expect(e.risk).toBe('warning');
    expect(e.detail).toContain('refuse');
  });
});

describe('Langue : la fenêtre de signature suit la langue choisie', () => {
  it('même demande, en anglais et en coréen — aucune phrase française', () => {
    const input: ExplainInput = { kind: 'tx', domain: 'x.com', decoded: decodeTx({ to: '0xnft', data: approveAll }), verify: { isScam: true } };
    const en = explain(input, 'en');
    expect(en.title).toBe('Approval');
    expect(en.reasons.join(' ')).toContain('fraudulent');
    const ko = explain(input, 'ko');
    expect(ko.title).toBe('승인');
    expect(`${ko.headline} ${ko.reasons.join(' ')}`).not.toMatch(/[àâéèêç]|tes |ton /);
  });
  it('raisons GoPlus (clés `gp…`) traduites', () => {
    const e = explain({ kind: 'message', domain: 'x.com', addressRisk: { level: 'danger', reasons: ['gpPhishing'] } }, 'en');
    expect(e.reasons).toContain('Phishing activity');
  });
  it('sans traducteur : des clés, jamais du français', () => {
    const e = explainRequest({ kind: 'siwe', domain: 'a.b', siwe: { domain: 'a.b' } as any });
    expect(e.title).toBe('exTitleConnect');
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
    const withSymbol = explain({ kind: 'typedData', domain: 'app.uniswap.org', typed, tokenSymbol: 'USDC', tokenDecimals: 18 });
    expect(withSymbol.headline).toContain('un montant illimité de tes USDC (Permit2)');
    expect(withSymbol.headline).not.toContain('tes Permit2');
    expect(withSymbol.risk).toBe('danger');
    const noSymbol = explain({ kind: 'typedData', domain: 'app.uniswap.org', typed });
    expect(noSymbol.headline).not.toContain('tes Permit2');
    expect(noSymbol.headline).toContain('(Permit2)');
  });

  it('Permit EIP-2612 classique : le nom du domaine est bien le token', () => {
    const typed = { name: 'USD Coin', primaryType: 'Permit', token: '0xA0b8...', amountRaw: '1000000', unlimited: false, permit2: false, details: [{ label: 'Autorisé (spender)', value: '0xspender' }] };
    const e = explain({ kind: 'typedData', domain: 'x.io', typed, tokenDecimals: 6 });
    expect(e.headline).toContain('jusqu’à 1 de tes USD Coin');
  });

  it('Solana : un swap Jupiter est expliqué comme un swap', () => {
    const e = explain({ kind: 'solanaTx', method: 'solana_signTransaction', domain: 'jup.ag', solana: { version: 0, programs: [], known: ['Jupiter v6', 'Compute Budget'], dapp: 'Jupiter v6', action: 'swap', instructions: 4, feePayer: 'x', lookupTables: 2, feePayerMismatch: false, signerCount: 1, signaturesPresent: [false] } });
    expect(e.title).toBe('Échange');
    expect(e.headline).toContain('Jupiter v6');
    expect(e.risk).toBe('none');
    const bad = explain({ kind: 'solanaTx', domain: 'jup.ag', solana: { version: 0, programs: [], known: [], dapp: null, action: 'contract', instructions: 1, feePayer: 'y', lookupTables: 0, feePayerMismatch: true, signerCount: 1, signaturesPresent: [false] } });
    expect(bad.risk).toBe('warning'); // programme inconnu
    const sponsored = explain({ kind: 'solanaTx', domain: 'jup.ag', solana: { version: 0, programs: [], known: ['Jupiter v6'], dapp: 'Jupiter v6', action: 'swap', instructions: 4, feePayer: '7rhxnLV8C77o6d8oz26AgK8x8m5ePsdeRawjqvojbjnQ', lookupTables: 2, feePayerMismatch: true, signerCount: 1, signaturesPresent: [false] } });
    expect(sponsored.risk).toBe('none');
    expect(sponsored.detail).toContain('payés par la dApp');
  });
});

describe('Bitcoin et messages (WalletConnect)', () => {
  it('lecture d’adresses : aucun risque, pas de maintien', () => {
    const e = explain({ kind: 'btcAccounts', domain: 'app.test' });
    expect(e.title).toBe('Lecture');
    expect(e.risk).toBe('none');
    expect(e.holdToSign).toBe(false);
  });
  it('transfert : montant en BTC et destinataire court', () => {
    const e = explain({ kind: 'btcTransfer', domain: 'app.test', btc: { to: 'bc1quc8glxvajh0c4ghv4htftk202ldx5h0u42hfyy', sats: 150000n } });
    expect(e.headline).toMatch(/0[.,]0015 BTC/);
    expect(e.lose[0]).toMatch(/0[.,]0015 BTC/);
    expect(e.risk).toBe('warning');
  });
  it('PSBT décodé : ce qui part, où, et les frais — plus de signature à l’aveugle', () => {
    const e = explain({ kind: 'btcPsbt', domain: 'app.test', btc: { broadcast: true, psbt: { outputs: [{ address: 'bc1qattacker0000000000000000000000000000000', sats: 98_000n, mine: false }], ownIn: 100_000n, sent: 98_000n, fee: 2_000n, unknownInputs: false } } });
    expect(e.headline).toMatch(/0[.,]00098 BTC/);
    expect(e.lose[0]).toMatch(/0[.,]00098 BTC/);
    expect(e.detail).toMatch(/0[.,]00002 BTC/);
    expect(e.reasons.join(' ')).toContain('diffusée immédiatement');
  });
  it('PSBT illisible : alerte, pas de faux montant', () => {
    const e = explain({ kind: 'btcPsbt', domain: 'app.test', btc: { broadcast: false, psbt: null } });
    expect(e.risk).toBe('warning');
    expect(e.lose).toEqual([]);
    expect(e.reasons.join(' ')).toContain('pas pu lire');
  });
  it('message : aperçu du texte décodé', () => {
    const e = explain({ kind: 'message', domain: 'app.test', messageText: 'This is a message to be signed for BIP122' });
    expect(e.detail).toContain('This is a message to be signed for BIP122');
  });
});

describe('EIP-712 pour un autre réseau', () => {
  it('Permit signé pour Ethereum alors que la dApp est connectée sur Base : alerte', () => {
    const typed = { name: 'USDC', primaryType: 'Permit', chainId: 1, details: [{ label: 'Autorisé (spender)', value: SPENDER }, { label: 'Montant', value: '1000000' }] };
    const e = explain({ kind: 'typedData', domain: 'x.com', typed, connectedChainId: 8453 });
    expect(e.reasons.join(' ')).toContain('Chain ID 1');
    expect(e.risk).not.toBe('none');
    const same = explain({ kind: 'typedData', domain: 'x.com', typed: { ...typed, chainId: 8453 }, connectedChainId: 8453 });
    expect(same.reasons.join(' ')).not.toContain('Chain ID');
  });
});
