import {
  checkBtcAddress,
  isValidBtcAddress,
  btcAddressKind,
  normalizeBtcAddress,
  assertValidBtcAddress,
} from './btcAddress';

/*
 * Adresses mainnet réelles, choisies pour être vérifiables publiquement :
 * - P2PKH : l'adresse du bloc de genèse ;
 * - P2SH : une adresse d'exemple de BIP-173 ;
 * - P2WPKH / P2WSH / P2TR : vecteurs de BIP-173 et BIP-350.
 */
const P2PKH = '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa';
const P2SH = '3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy';
const P2WPKH = 'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4';
const P2WSH = 'bc1qrp33g0q5c5txsp9arysrx4k6zdkfs4nce4xj0gdcccefvpysxf3qccfmv3';
const P2TR = 'bc1p0xlxvlhemja6c4dqv22uapctqupfhlxm9h8z3k2e72q4k9hcz7vqzk5jj0';

describe('checkBtcAddress — les quatre familles', () => {
  it('reconnaît P2PKH (1…) — refusé par la version précédente', () => {
    // Le cœur du trou : « Adresse Bitcoin invalide » sur une adresse valide,
    // donc impossible d'envoyer vers un portefeuille ancien.
    expect(checkBtcAddress(P2PKH)).toEqual({ valid: true, kind: 'p2pkh' });
  });

  it('reconnaît P2SH (3…) — le format de dépôt de beaucoup de plateformes', () => {
    expect(checkBtcAddress(P2SH)).toEqual({ valid: true, kind: 'p2sh' });
  });

  it('reconnaît P2WPKH, P2WSH et Taproot', () => {
    expect(btcAddressKind(P2WPKH)).toBe('p2wpkh');
    expect(btcAddressKind(P2WSH)).toBe('p2wsh');
    expect(btcAddressKind(P2TR)).toBe('p2tr');
  });

  it('espaces autour tolérés', () => {
    expect(checkBtcAddress(` ${P2PKH} `).valid).toBe(true);
    expect(checkBtcAddress(` ${P2WPKH} `).valid).toBe(true);
  });

  it('vide → EMPTY, reste → INVALID', () => {
    expect(checkBtcAddress('').reason).toBe('EMPTY');
    expect(checkBtcAddress('   ').reason).toBe('EMPTY');
    expect(checkBtcAddress('pas-une-adresse').reason).toBe('INVALID');
  });
});

describe('checkBtcAddress — ce qui doit être refusé', () => {
  it('checksum base58 cassé', () => {
    // Dernier caractère modifié : la forme est bonne, le checksum non.
    expect(isValidBtcAddress('1A1zP1eP5QGefi2DMPTfTL5SLmv7Divfnb')).toBe(false);
  });

  it('checksum bech32 cassé', () => {
    expect(isValidBtcAddress('bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyX')).toBe(false);
  });

  it('adresses TESTNET refusées : l\'app est mainnet, y envoyer perdrait les fonds', () => {
    expect(isValidBtcAddress('mipcBbFg9gMiCh81Kj8tqqdgoZub1ZJRfn')).toBe(false); // P2PKH testnet
    expect(isValidBtcAddress('2N2JD6wb56AfK4tfmM6PwdVmoYk2dCKf4Br')).toBe(false); // P2SH testnet
    expect(isValidBtcAddress('tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx')).toBe(false); // bech32 testnet
  });

  it('casse MIXTE en bech32 refusée (BIP-173 : checksum ambigu)', () => {
    const mixed = 'bc1QW508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4';
    expect(isValidBtcAddress(mixed)).toBe(false);
  });

  it('une adresse EVM n\'est pas une adresse Bitcoin', () => {
    expect(isValidBtcAddress('0x9858EfFD232B4033E47d90003D41EC34EcaEda94')).toBe(false);
  });

  it('base58check de la bonne longueur mais version inconnue', () => {
    expect(isValidBtcAddress('7VZNX1SN5NtKa8UQFxwQbFeFc3iqRYhemu')).toBe(false);
  });
});

describe('normalizeBtcAddress', () => {
  it('bech32 MAJUSCULE (la forme des QR) → minuscules', () => {
    expect(normalizeBtcAddress(P2WPKH.toUpperCase())).toBe(P2WPKH);
    expect(isValidBtcAddress(P2WPKH.toUpperCase())).toBe(true);
  });

  it('base58 laissé INTACT — sa casse est significative', () => {
    // Le bug corrigé : un `toLowerCase()` global détruisait ces adresses.
    expect(normalizeBtcAddress(P2PKH)).toBe(P2PKH);
    expect(normalizeBtcAddress(P2SH)).toBe(P2SH);
    expect(isValidBtcAddress(P2PKH.toLowerCase())).toBe(false);
  });
});

describe('assertValidBtcAddress', () => {
  it('renvoie la forme canonique', () => {
    expect(assertValidBtcAddress(` ${P2WPKH.toUpperCase()} `)).toBe(P2WPKH);
    expect(assertValidBtcAddress(` ${P2PKH} `)).toBe(P2PKH);
  });
  it('lève sur une adresse invalide', () => {
    expect(() => assertValidBtcAddress('nope')).toThrow(/invalide/i);
  });
});
