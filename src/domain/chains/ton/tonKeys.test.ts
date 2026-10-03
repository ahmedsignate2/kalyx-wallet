/**
 * Clé TON d'une phrase : on doit tomber EXACTEMENT sur ce que Tonkeeper dérive.
 *
 * ## Provenance des vecteurs (`tonkeeper-vectors.json`)
 *
 * Aucun n'est calculé par le code testé :
 *
 * - Les cinq phrases TON et leurs clés viennent de `@ton/crypto`
 *   (`src/mnemonic/mnemonic.spec.ts`), la bibliothèque officielle.
 * - Les phrases BIP-39 ont été dérivées par la fonction de chemin de Tonkeeper
 *   (`tonkeeper-web/packages/core/src/service/ed25519.ts`), recopiée à
 *   l'identique, avec `bip39` 3.1.0 et `tweetnacl`, selon la règle de
 *   `mnemonicService.ts` (TON d'abord, puis BIP-39 sur `m/44'/607'/0'`). Le même
 *   banc reproduisait d'abord les cinq clés officielles, ce qui le valide.
 * - Les adresses viennent de `@ton/ton` 16.3.0 (`WalletContractV5R1`,
 *   `WalletContractV4`, `WalletContractV3R2`) sur `@ton/core` 0.63.1.
 */
import { hex } from '@scure/base';
import { validateMnemonic } from '../../../crypto/mnemonic';
import { isValidTonMnemonic } from './tonMnemonic';
import { resolveTonKey, tonKeyKind, TON_BIP39_PATH } from './tonKeys';
import VECTORS from './tonkeeper-vectors.json';

describe('resolveTonKey — même clé que Tonkeeper', () => {
  it.each(VECTORS.keys.map((k) => [`${k.kind} · ${k.phrase.split(' ').slice(0, 3).join(' ')}…`, k]))('%s', (_, k) => {
    expect(tonKeyKind(k.phrase)).toBe(k.kind);
    const key = resolveTonKey(k.phrase);
    expect(key.kind).toBe(k.kind);
    expect(hex.encode(key.seed)).toBe(k.seed);
    expect(hex.encode(key.publicKey)).toBe(k.publicKey);
  });

  it('suit le chemin de Tonkeeper pour les phrases BIP-39', () => {
    expect(TON_BIP39_PATH).toBe("m/44'/607'/0'");
  });
});

describe('ordre de priorité — TON avant BIP-39', () => {
  /*
   * Le cas qui décide de tout : une phrase valide dans LES DEUX systèmes.
   * Tonkeeper teste TON en premier et la dérive donc en native. Tester BIP-39
   * d'abord donnerait une autre clé, donc une autre adresse — un portefeuille
   * vide d'un côté ou de l'autre.
   */
  it('une phrase valide en TON ET en BIP-39 est dérivée en native', () => {
    const both = VECTORS.keys.find((k) => k.source.includes('AUSSI en TON'))!;
    expect(validateMnemonic(both.phrase)).toBe(true);
    expect(isValidTonMnemonic(both.phrase)).toBe(true);
    expect(tonKeyKind(both.phrase)).toBe('ton');
  });

  /*
   * L'autre moitié du problème : les phrases Tonkeeper ne sont PAS des phrases
   * BIP-39. Un import qui n'accepterait que BIP-39 refuserait toutes celles-ci.
   */
  it('les phrases TON officielles échouent au contrôle BIP-39', () => {
    for (const k of VECTORS.keys.filter((v) => v.source.startsWith('@ton/crypto'))) {
      expect(validateMnemonic(k.phrase)).toBe(false);
      expect(tonKeyKind(k.phrase)).toBe('ton');
    }
  });
});

describe('phrases invalides', () => {
  it.each(VECTORS.invalid.map((p) => [p.split(' ').slice(-2).join(' '), p]))('« …%s » est refusée', (_, p) => {
    expect(tonKeyKind(p)).toBeNull();
    expect(() => resolveTonKey(p)).toThrow();
  });
});
