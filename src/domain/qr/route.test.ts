import { qrTargetFamily, kalyxChainIdForEvm, describeQr, sendIntentFor } from './route';
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

/* Traducteur d'essai : renvoie la clé, ce qui rend les assertions explicites
   et prouve au passage qu'aucun libellé n'est plus écrit en dur. */
const T = (k: string) => k;

describe('describeQr', () => {
  it('adresse : montre l\'adresse + CTA Envoyer', () => {
    const d = describeQr({ kind: 'solana-address', address: 'SoLAddr' }, T);
    expect(d.cta).toBe('actionSend');
    expect(d.detail).toContain('SoLAddr');
    expect(d.danger).toBe(false);
  });
  it('paiement avec montant : montant affiché', () => {
    const d = describeQr({ kind: 'bitcoin-uri', address: 'bc1x', amount: '0.01' }, T);
    expect(d.detail).toContain('0.01');
  });
  it('URL : marquée dangereuse', () => {
    const d = describeQr({ kind: 'url', url: 'https://x.io' }, T);
    expect(d.danger).toBe(true);
    expect(d.detail).toBe('https://x.io');
  });
  it('invalide : pas de CTA', () => {
    expect(describeQr({ kind: 'invalid', raw: 'zzz' } as QrResult, T).cta).toBeNull();
  });

  it('paiement en jeton : le JETON est montré, pas seulement l\'adresse', () => {
    // Sans ça, une facture en USDC et un envoi d'ETH s'affichaient à
    // l'identique — même titre, même adresse, rien pour les distinguer.
    const d = describeQr(
      { kind: 'ethereum-uri', address: '0xdest', contract: '0xusdc', amountRaw: '1500000' },
      T,
    );
    expect(d.detail).toContain('0xdest');
    expect(d.detail).toContain('0xusdc');
    // Le montant brut n'est PAS affiché : sans les décimales il serait faux.
    expect(d.detail).not.toContain('1500000');
  });

  it('BIP-21 : le bénéficiaire annoncé et le motif sont montrés', () => {
    const d = describeQr(
      { kind: 'bitcoin-uri', address: 'bc1x', amount: '0.01', label: 'Café Nova', message: 'Table 12' },
      T,
    );
    expect(d.detail).toContain('Café Nova');
    expect(d.detail).toContain('Table 12');
  });

  it('aucun libellé en dur : tout passe par le traducteur', () => {
    const d = describeQr({ kind: 'walletconnect', uri: 'wc:x' }, T);
    expect(d.title).toBe('qrWcTitle');
    expect(d.cta).toBe('connect');
  });
});

describe('sendIntentFor', () => {
  it('EIP-681 transfer : destinataire ≠ contrat, et les deux sont transmis', () => {
    // Le scanner ne transmettait que `to`/`amount` : le jeton était perdu, et
    // une facture en USDC devenait un envoi de la pièce native.
    const i = sendIntentFor({
      kind: 'ethereum-uri',
      address: '0xdest',
      contract: '0xusdc',
      amountRaw: '1500000',
      chainId: 1,
    });
    expect(i).toEqual({ to: '0xdest', contract: '0xusdc', amountRaw: '1500000', amount: undefined });
  });

  it('Solana Pay avec spl-token : le montant décimal est conservé', () => {
    const i = sendIntentFor({ kind: 'solana-uri', address: 'SoL', amount: '12.5', splToken: 'Mint' });
    expect(i).toEqual({ to: 'SoL', amount: '12.5', mint: 'Mint' });
  });

  it('BIP-21 : label et message remontent pour affichage', () => {
    const i = sendIntentFor({
      kind: 'bitcoin-uri',
      address: 'bc1x',
      amount: '0.01',
      label: 'Café Nova',
      message: 'Table 12',
    });
    /*
     * `note` et non `memo` : sur Solana, `memo` est une instruction écrite
     * ON-CHAIN, pas un texte d'interface. Confondre les deux ferait inscrire
     * dans la blockchain un libellé destiné à l'écran.
     */
    expect(i).toEqual({ to: 'bc1x', amount: '0.01', payee: 'Café Nova', note: 'Table 12' });
  });

  it('adresse nue : destinataire seul, aucun montant inventé', () => {
    expect(sendIntentFor({ kind: 'evm-address', address: '0xabc' })).toEqual({ to: '0xabc' });
  });

  it('null pour ce qui n\'est pas un envoi', () => {
    expect(sendIntentFor({ kind: 'walletconnect', uri: 'wc:x' })).toBeNull();
    expect(sendIntentFor({ kind: 'url', url: 'https://x' })).toBeNull();
    expect(sendIntentFor({ kind: 'invalid', raw: 'zz' })).toBeNull();
  });
});

describe('WalletConnect Pay dans le routage', () => {
  it('n\'est PAS une intention d\'envoi', () => {
    /*
     * Un lien Pay désigne une DEMANDE côté marchand, pas un destinataire. Le
     * traiter comme un envoi préremplirait l'écran d'envoi avec une URL en
     * guise d'adresse.
     */
    expect(sendIntentFor({ kind: 'wc-pay', link: 'https://pay.walletconnect.com/x' })).toBeNull();
    expect(qrTargetFamily({ kind: 'wc-pay', link: 'https://pay.walletconnect.com/x' })).toBeNull();
  });

  it('se décrit avec ses propres libellés, traduits', () => {
    const d = describeQr({ kind: 'wc-pay', link: 'https://pay.walletconnect.com/x' }, T);
    expect(d.title).toBe('qrPayTitle');
    expect(d.cta).toBe('next');
    expect(d.danger).toBe(false);
  });
});
