import { deriveBtcAccount, btcPath } from './btc';
import { mnemonicToSeedSync } from './mnemonic';
import { isValidBtcAddress, checkBtcAddress } from '../domain/validation/btcAddress';

const PHRASE =
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

// Vecteurs OFFICIELS BIP-84 (Appendix). Preuve de conformité.
const BTC_ADDR_0 = 'bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu';
const BTC_ADDR_1 = 'bc1qnjg0jd8228aq7egyzacy8cys3knf9xvrerkf9g';

describe('dérivation Bitcoin (BIP-84)', () => {
  const seed = mnemonicToSeedSync(PHRASE);

  it('produit le chemin BIP-84 attendu', () => {
    expect(btcPath(0)).toBe("m/84'/0'/0'/0/0");
    expect(btcPath(2)).toBe("m/84'/0'/0'/0/2");
  });

  it('dérive les adresses de référence connues (bc1...)', () => {
    expect(deriveBtcAccount(seed, 0).address).toBe(BTC_ADDR_0);
    expect(deriveBtcAccount(seed, 1).address).toBe(BTC_ADDR_1);
  });

  it('est déterministe et distinct par index', () => {
    expect(deriveBtcAccount(seed, 0).address).toBe(
      deriveBtcAccount(mnemonicToSeedSync(PHRASE), 0).address,
    );
    expect(deriveBtcAccount(seed, 0).address).not.toBe(deriveBtcAccount(seed, 1).address);
  });
});

describe('validation adresse Bitcoin', () => {
  it('accepte une adresse bc1 valide', () => {
    expect(isValidBtcAddress(BTC_ADDR_0)).toBe(true);
    expect(checkBtcAddress(` ${BTC_ADDR_0} `).valid).toBe(true);
  });

  it('rejette le vide et les adresses invalides', () => {
    expect(checkBtcAddress('').reason).toBe('EMPTY');
    expect(checkBtcAddress('pas-une-adresse').reason).toBe('INVALID');
    // Adresse bech32 au checksum cassé.
    expect(isValidBtcAddress('bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyX')).toBe(false);
    // Une adresse EVM n'est pas une adresse BTC.
    expect(isValidBtcAddress('0x9858EfFD232B4033E47d90003D41EC34EcaEda94')).toBe(false);
  });
});
