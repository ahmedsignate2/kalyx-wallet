import { parseTransferFeeConfig, transferFeeFor, amountAfterTransferFee } from './token2022';

/** Réponse getAccountInfo jsonParsed d'un mint Token-2022 à frais. */
const mintWithFee = (older: unknown, newer: unknown) => ({
  value: {
    data: { parsed: { info: { extensions: [{ extension: 'transferFeeConfig', state: { olderTransferFee: older, newerTransferFee: newer } }] } } },
  },
});

const fee = (epoch: number, bp: number, max: string) => ({
  epoch,
  transferFeeBasisPoints: bp,
  maximumFee: max,
});

describe('parseTransferFeeConfig', () => {
  it('lit le barème en vigueur à l\'époque courante', () => {
    const info = mintWithFee(fee(100, 50, '1000000'), fee(200, 100, '2000000'));
    // Époque 150 : le nouveau barème (époque 200) n'est pas encore actif.
    expect(parseTransferFeeConfig(info, 150)).toEqual({ basisPoints: 50, maximumFee: 1_000_000n });
    // Époque 200 : il l'est.
    expect(parseTransferFeeConfig(info, 200)).toEqual({ basisPoints: 100, maximumFee: 2_000_000n });
    expect(parseTransferFeeConfig(info, 999)).toEqual({ basisPoints: 100, maximumFee: 2_000_000n });
  });

  it('un barème uniquement FUTUR ne prélève rien aujourd\'hui', () => {
    // Prendre systématiquement le plus récent annoncerait un prélèvement qui
    // n'est pas encore en vigueur.
    const info = mintWithFee(undefined, fee(500, 300, '5000'));
    expect(parseTransferFeeConfig(info, 10)).toEqual({ basisPoints: 0, maximumFee: 0n });
  });

  it('null quand le mint n\'a pas l\'extension', () => {
    expect(parseTransferFeeConfig({ value: { data: { parsed: { info: { extensions: [] } } } } }, 1)).toBeNull();
    expect(parseTransferFeeConfig({ value: { data: { parsed: { info: {} } } } }, 1)).toBeNull();
  });

  it('survit à toute réponse malformée', () => {
    for (const bad of [null, undefined, 'nope', 42, {}, { value: null }, { value: { data: 'x' } }]) {
      expect(parseTransferFeeConfig(bad, 1)).toBeNull();
    }
  });

  it('refuse un prélèvement supérieur à 100 % : c\'est une donnée fausse', () => {
    const info = mintWithFee(undefined, fee(0, 10_001, '1'));
    expect(parseTransferFeeConfig(info, 5)).toBeNull();
  });

  it('accepte les nombres comme les chaînes (les u64 arrivent en chaîne)', () => {
    const info = mintWithFee(undefined, { epoch: '0', transferFeeBasisPoints: '25', maximumFee: '99' });
    expect(parseTransferFeeConfig(info, 3)).toEqual({ basisPoints: 25, maximumFee: 99n });
  });
});

describe('transferFeeFor', () => {
  const cfg = { basisPoints: 50, maximumFee: 1_000_000n }; // 0,5 %

  it('prélève le pourcentage attendu', () => {
    expect(transferFeeFor(1_000_000n, cfg)).toBe(5_000n); // 0,5 % de 1 USDC (6 déc.)
  });

  it('arrondit au SUPÉRIEUR, comme le programme', () => {
    /*
     * Arrondir vers le bas afficherait un frais inférieur au réel, donc un
     * montant reçu supérieur à la réalité — l'erreur dans le mauvais sens.
     */
    expect(transferFeeFor(1n, cfg)).toBe(1n);
    expect(transferFeeFor(199n, cfg)).toBe(1n);
    expect(transferFeeFor(201n, cfg)).toBe(2n);
  });

  it('respecte le plafond', () => {
    expect(transferFeeFor(10n ** 12n, cfg)).toBe(cfg.maximumFee);
  });

  it('zéro quand il n\'y a pas de frais', () => {
    expect(transferFeeFor(1_000_000n, null)).toBe(0n);
    expect(transferFeeFor(1_000_000n, { basisPoints: 0, maximumFee: 500n })).toBe(0n);
    expect(transferFeeFor(0n, cfg)).toBe(0n);
  });
});

describe('amountAfterTransferFee', () => {
  it('donne ce que le destinataire recevra vraiment', () => {
    // C'est la valeur qu'il faut montrer : sans elle, l'app annonce 100 et 99,5
    // arrivent, et l'utilisateur croit que le portefeuille a perdu la différence.
    expect(amountAfterTransferFee(1_000_000n, { basisPoints: 50, maximumFee: 10n ** 9n })).toBe(995_000n);
  });

  it('identité quand il n\'y a pas de frais', () => {
    expect(amountAfterTransferFee(777n, null)).toBe(777n);
  });

  it('jamais négatif, même si le plafond dépasse le montant', () => {
    expect(amountAfterTransferFee(10n, { basisPoints: 10_000, maximumFee: 10n ** 9n })).toBe(0n);
  });
});
