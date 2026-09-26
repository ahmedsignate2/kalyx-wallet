/**
 * Adresse TON d'une clé publique, par version de contrat.
 *
 * Les adresses attendues viennent de `@ton/ton` 16.3.0 pour les mêmes clés — voir
 * la provenance dans `tonKeys.test.ts`. Neuf clés × trois versions × trois
 * écritures : une erreur d'un bit dans la cellule `data`, la cellule `StateInit`
 * ou la représentation fait échouer toutes les lignes d'une version.
 */
import { hex } from '@scure/base';
import { formatTonAddress, toRawTonAddress } from './tonAddress';
import { tonW5WalletId, tonWalletAddress, TON_DEFAULT_WALLET_VERSION, TON_IMPORT_WALLET_VERSIONS, type TonWalletVersion } from './tonWallet';
import VECTORS from './tonkeeper-vectors.json';

const VERSIONS: TonWalletVersion[] = ['v5r1', 'v4r2', 'v3r2'];

describe('tonWalletAddress — mêmes adresses que @ton/ton', () => {
  for (const k of VECTORS.keys) {
    const pub = hex.decode(k.publicKey);
    it.each(VERSIONS)(`${k.kind} ${k.publicKey.slice(0, 8)}… · %s`, (v) => {
      const a = tonWalletAddress(pub, v);
      const want = k[v];
      expect(toRawTonAddress(a)).toBe(want.raw);
      expect(formatTonAddress(a, { bounceable: false })).toBe(want.uq);
      expect(formatTonAddress(a, { bounceable: true })).toBe(want.eq);
    });
  }

  /*
   * Sur W5, le réseau entre dans le `wallet_id` : le réseau de test donne une
   * AUTRE adresse, pas seulement une autre écriture. Oublier ce détail enverrait
   * des fonds de test vers une adresse que personne ne contrôle.
   */
  it.each(VECTORS.keys.map((k) => [k.publicKey.slice(0, 8), k]))('W5 réseau de test · %s…', (_, k) => {
    const a = tonWalletAddress(hex.decode(k.publicKey), 'v5r1', { testnet: true });
    expect(toRawTonAddress(a)).toBe(k.v5r1Testnet.raw);
    expect(formatTonAddress(a, { bounceable: false, testnet: true })).toBe(k.v5r1Testnet.uq);
    expect(k.v5r1Testnet.raw).not.toBe(k.v5r1.raw);
  });
});

describe('versions', () => {
  it('crée en W5, comme Tonkeeper, et relit v4R2 et v3R2 à l’import', () => {
    expect(TON_DEFAULT_WALLET_VERSION).toBe('v5r1');
    expect(TON_IMPORT_WALLET_VERSIONS).toEqual(['v5r1', 'v4r2', 'v3r2']);
  });

  it('une même clé donne trois adresses différentes', () => {
    const pub = hex.decode(VECTORS.keys[0].publicKey);
    const raws = new Set(VERSIONS.map((v) => toRawTonAddress(tonWalletAddress(pub, v))));
    expect(raws.size).toBe(3);
  });

  it('refuse une clé publique de mauvaise taille', () => {
    expect(() => tonWalletAddress(new Uint8Array(31), 'v5r1')).toThrow();
  });
});

describe('tonW5WalletId', () => {
  it('vaut 2147483409 sur le réseau principal (valeur lue dans @ton/core)', () => {
    expect(tonW5WalletId()).toBe(2147483409);
  });
  it('change avec le réseau et le sous-portefeuille', () => {
    expect(tonW5WalletId({ testnet: true })).not.toBe(tonW5WalletId());
    expect(tonW5WalletId({ subwallet: 1 })).not.toBe(tonW5WalletId());
    expect(() => tonW5WalletId({ subwallet: 0x8000 })).toThrow();
  });
});
