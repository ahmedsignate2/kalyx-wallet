import { qrTargetFamily, kalyxChainIdForEvm, describeQr } from './route';
import type { QrResult } from './parse';

const CHAINS = [
  { id: 'ethereum', evmChainId: 1 },
  { id: 'polygon', evmChainId: 137 },
  { id: 'bitcoin' },
  { id: 'solana' },
];

describe('qrTargetFamily', () => {
  it('mappe chaque type transactionnel à sa famille', () => {
    expect(qrTargetFamily({ kind: 'evm-address', address: '0x' })).toBe('evm');
    expect(qrTargetFamily({ kind: 'ethereum-uri', address: '0x' })).toBe('evm');
    expect(qrTargetFamily({ kind: 'bitcoin-address', address: 'bc1' })).toBe('bitcoin');
    expect(qrTargetFamily({ kind: 'solana-uri', address: 'x' })).toBe('solana');
  });
  it('null pour wc / url / invalide', () => {
    expect(qrTargetFamily({ kind: 'walletconnect', uri: 'wc:' })).toBeNull();
    expect(qrTargetFamily({ kind: 'url', url: 'https://x' })).toBeNull();
    expect(qrTargetFamily({ kind: 'invalid', raw: '' })).toBeNull();
  });
});

describe('kalyxChainIdForEvm', () => {
  it('résout un chainId connu', () => {
    expect(kalyxChainIdForEvm(137, CHAINS)).toBe('polygon');
  });
  it('null si inconnu ou absent', () => {
    expect(kalyxChainIdForEvm(999, CHAINS)).toBeNull();
    expect(kalyxChainIdForEvm(undefined, CHAINS)).toBeNull();
  });
});

describe('describeQr', () => {
  it('adresse : montre l\'adresse + CTA Envoyer', () => {
    const d = describeQr({ kind: 'solana-address', address: 'SoLAddr' });
    expect(d.cta).toBe('Envoyer');
    expect(d.detail).toContain('SoLAddr');
    expect(d.danger).toBe(false);
  });
  it('paiement avec montant : montant affiché', () => {
    const d = describeQr({ kind: 'bitcoin-uri', address: 'bc1x', amount: '0.01' });
    expect(d.detail).toContain('0.01');
  });
  it('URL : marquée dangereuse', () => {
    const d = describeQr({ kind: 'url', url: 'https://x.io' });
    expect(d.danger).toBe(true);
    expect(d.detail).toBe('https://x.io');
  });
  it('invalide : pas de CTA', () => {
    expect(describeQr({ kind: 'invalid', raw: 'zzz' } as QrResult).cta).toBeNull();
  });
});
