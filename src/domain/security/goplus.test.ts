import { parseAddressSecurity, parseTokenSecurity, parsePhishingSite } from './goplus';

describe('GoPlus — parseAddressSecurity', () => {
  it('signale un contrat malveillant', () => {
    const r = parseAddressSecurity({ result: { malicious_contract: '1', phishing_activities: '0' } });
    expect(r.level).toBe('danger');
    expect(r.reasons).toContain('gpMaliciousContract'); // une CLÉ, traduite à l'affichage
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
    expect(r.reasons[0]).toBe('gpHoneypot');
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

describe('GoPlus — phishingSiteStatus (trois états)', () => {
  const { parsePhishingSiteStatus, phishingSiteStatus } = jest.requireActual('./goplus') as typeof import('./goplus');
  const res = (status: number, body: unknown) => ({ ok: status >= 200 && status < 300, status, json: async () => body }) as unknown as Response;

  it('parse : phishing / safe / unknown', () => {
    expect(parsePhishingSiteStatus({ code: 1, result: { phishing_site: 1 } })).toBe('phishing');
    expect(parsePhishingSiteStatus({ code: 1, result: { phishing_site: 0 } })).toBe('safe');
    expect(parsePhishingSiteStatus({ code: 4029, message: 'limit' })).toBe('unknown');
    expect(parsePhishingSiteStatus({ code: 1 })).toBe('unknown');
    expect(parsePhishingSiteStatus({})).toBe('unknown');
    expect(parsePhishingSiteStatus(null)).toBe('unknown');
  });
  it('une erreur réseau donne unknown, jamais safe', async () => {
    await expect(phishingSiteStatus('https://x.io', (async () => { throw new Error('offline'); }) as typeof fetch)).resolves.toBe('unknown');
  });
  it('un HTTP 429/500 donne unknown', async () => {
    await expect(phishingSiteStatus('https://x.io', (async () => res(429, { code: 1, result: { phishing_site: 0 } })) as typeof fetch)).resolves.toBe('unknown');
    await expect(phishingSiteStatus('https://x.io', (async () => res(500, {})) as typeof fetch)).resolves.toBe('unknown');
  });
  it('une réponse valide est relue', async () => {
    await expect(phishingSiteStatus('https://x.io', (async () => res(200, { code: 1, result: { phishing_site: 0 } })) as typeof fetch)).resolves.toBe('safe');
    await expect(phishingSiteStatus('https://x.io', (async () => res(200, { code: 1, result: { phishing_site: '1' } })) as typeof fetch)).resolves.toBe('phishing');
  });
});
