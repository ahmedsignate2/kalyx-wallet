import { parseAddressSecurity, parseTokenSecurity, parsePhishingSite } from './goplus';

describe('GoPlus — parseAddressSecurity', () => {
  it('signale un contrat malveillant', () => {
    const r = parseAddressSecurity({ result: { malicious_contract: '1', phishing_activities: '0' } });
    expect(r.level).toBe('danger');
    expect(r.reasons).toContain('Contrat malveillant signalé');
  });
  it('ok quand aucun drapeau', () => {
    expect(parseAddressSecurity({ result: { malicious_contract: '0' } })).toEqual({ level: 'ok', reasons: [] });
  });
  it('unknown si pas de result', () => {
    expect(parseAddressSecurity({}).level).toBe('unknown');
    expect(parseAddressSecurity(null).level).toBe('unknown');
  });
  it('cumule plusieurs raisons', () => {
    const r = parseAddressSecurity({ result: { phishing_activities: '1', sanctioned: '1' } });
    expect(r.reasons).toHaveLength(2);
  });
});

describe('GoPlus — parseTokenSecurity (honeypot)', () => {
  const C = '0xAbC0000000000000000000000000000000000001';
  it('détecte un honeypot (clé en minuscules)', () => {
    const r = parseTokenSecurity({ result: { [C.toLowerCase()]: { is_honeypot: '1' } } }, C);
    expect(r.level).toBe('danger');
    expect(r.reasons[0]).toMatch(/Honeypot/);
  });
  it('ok si token sain', () => {
    expect(parseTokenSecurity({ result: { [C.toLowerCase()]: { is_honeypot: '0' } } }, C).level).toBe('ok');
  });
  it('unknown si contrat absent de la réponse', () => {
    expect(parseTokenSecurity({ result: {} }, C).level).toBe('unknown');
  });
});

describe('GoPlus — parsePhishingSite', () => {
  it('true si phishing_site = 1', () => {
    expect(parsePhishingSite({ result: { phishing_site: 1 } })).toBe(true);
    expect(parsePhishingSite({ result: { phishing_site: '1' } })).toBe(true);
  });
  it('false sinon', () => {
    expect(parsePhishingSite({ result: { phishing_site: 0 } })).toBe(false);
    expect(parsePhishingSite({})).toBe(false);
  });
});
