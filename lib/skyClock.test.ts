import { latitudeFor, sunTimes } from './skyClock';

describe('heure du ciel', () => {
  it('estime la latitude depuis le fuseau', () => {
    expect(latitudeFor('Europe/Paris')).toBe(46);
    expect(latitudeFor('Australia/Sydney')).toBeLessThan(0);
    expect(Math.abs(latitudeFor('Asia/Bangkok'))).toBeLessThan(20);
    expect(latitudeFor('Africa/Johannesburg')).toBeLessThan(0);
  });

  it('allonge les jours en été et les raccourcit en hiver (hémisphère nord)', () => {
    const june = sunTimes(new Date(2026, 5, 21, 12), 46);
    const dec = sunTimes(new Date(2026, 11, 21, 12), 46);
    expect(june.set - june.rise).toBeGreaterThan(15);
    expect(june.set - june.rise).toBeLessThan(16.5);
    expect(dec.set - dec.rise).toBeGreaterThan(8);
    expect(dec.set - dec.rise).toBeLessThan(9.5);
  });

  it('inverse les saisons dans l’hémisphère sud', () => {
    const june = sunTimes(new Date(2026, 5, 21, 12), -34);
    const dec = sunTimes(new Date(2026, 11, 21, 12), -34);
    expect(june.set - june.rise).toBeLessThan(dec.set - dec.rise);
  });

  it('garde des jours presque égaux sous les tropiques', () => {
    const june = sunTimes(new Date(2026, 5, 21, 12), 12);
    const dec = sunTimes(new Date(2026, 11, 21, 12), 12);
    expect(Math.abs((june.set - june.rise) - (dec.set - dec.rise))).toBeLessThan(1.6);
  });
});
