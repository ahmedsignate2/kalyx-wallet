import {
  parseBtcFeeRates,
  bumpedRate,
  FALLBACK_RATES,
  MIN_RELAY_RATE,
  MAX_SANE_RATE,
} from './btcFees';

describe('parseBtcFeeRates', () => {
  it('traduit une réponse mempool.space en trois paliers', () => {
    const r = parseBtcFeeRates({ fastestFee: 40, halfHourFee: 22, hourFee: 12, economyFee: 3, minimumFee: 1 });
    expect(r).toEqual({ slow: 12, normal: 22, fast: 40 });
  });

  it('garde les paliers CROISSANTS même si l\'API les donne à l\'envers', () => {
    // Sinon l'interface afficherait « rapide » moins cher que « lent », ce que
    // personne ne peut interpréter.
    const r = parseBtcFeeRates({ fastestFee: 5, halfHourFee: 20, hourFee: 30 });
    expect(r.slow).toBeLessThanOrEqual(r.normal);
    expect(r.normal).toBeLessThanOrEqual(r.fast);
  });

  it('champ par champ : ce qui manque retombe sur le repli', () => {
    const r = parseBtcFeeRates({ halfHourFee: 25 });
    expect(r.normal).toBe(25);
    expect(r.fast).toBeGreaterThanOrEqual(25);
  });

  it('economyFee sert de repli pour le palier lent', () => {
    const r = parseBtcFeeRates({ fastestFee: 40, halfHourFee: 22, economyFee: 4 });
    expect(r.slow).toBe(4);
  });

  it('jamais sous le minimum de relais : sinon aucun nœud ne propage', () => {
    const r = parseBtcFeeRates({ fastestFee: 1, halfHourFee: 1, hourFee: 1, minimumFee: 6 });
    expect(r.slow).toBeGreaterThanOrEqual(6);
    expect(r.normal).toBeGreaterThanOrEqual(6);
  });

  it('plafonne une réponse aberrante : les frais ne doivent pas vider le portefeuille', () => {
    const r = parseBtcFeeRates({ fastestFee: 9_999_999, halfHourFee: 500_000, hourFee: 100_000 });
    expect(r.fast).toBe(MAX_SANE_RATE);
    expect(r.slow).toBeLessThanOrEqual(MAX_SANE_RATE);
  });

  it('survit à n\'importe quelle réponse malformée', () => {
    for (const bad of [null, undefined, 'nope', 42, [], {}, { fastestFee: 'x' }, { halfHourFee: -5 }, { hourFee: NaN }]) {
      const r = parseBtcFeeRates(bad);
      expect(r.slow).toBeGreaterThanOrEqual(MIN_RELAY_RATE);
      expect(r.slow).toBeLessThanOrEqual(r.normal);
      expect(r.normal).toBeLessThanOrEqual(r.fast);
    }
    expect(parseBtcFeeRates({})).toEqual(FALLBACK_RATES);
  });

  it('arrondit au supérieur : les frais se paient sur des vB entiers', () => {
    expect(parseBtcFeeRates({ halfHourFee: 12.3 }).normal).toBe(13);
  });
});

describe('bumpedRate', () => {
  it('impose au moins +25 % : un remplacement doit payer strictement plus', () => {
    // Un remplacement au même taux est rejeté par les nœuds, et l'accélération
    // échoue sans explication compréhensible.
    expect(bumpedRate(20, 20)).toBe(25);
    expect(bumpedRate(20, 10)).toBe(25);
  });

  it('impose au moins +1 sat/vB quand +25 % n\'ajoute rien', () => {
    expect(bumpedRate(1, 1)).toBe(2);
    expect(bumpedRate(2, 2)).toBe(3);
  });

  it('suit la cible quand elle est déjà au-dessus du plancher', () => {
    expect(bumpedRate(20, 100)).toBe(100);
  });

  it('reste sous le plafond de garde-fou', () => {
    expect(bumpedRate(100, MAX_SANE_RATE * 10)).toBe(MAX_SANE_RATE);
  });

  it('null quand le plancher requis dépasse le plafond : accélération impossible', () => {
    /*
     * Rendre le plafond lui-même serait un piège : le remplacement paierait le
     * MÊME taux que l'original, donc les nœuds le refuseraient, et l'utilisateur
     * attendrait une accélération qui n'arrive jamais. Mieux vaut le dire.
     */
    expect(bumpedRate(MAX_SANE_RATE, MAX_SANE_RATE)).toBeNull();
    expect(bumpedRate(MAX_SANE_RATE - 1, MAX_SANE_RATE)).toBeNull();
  });
});
