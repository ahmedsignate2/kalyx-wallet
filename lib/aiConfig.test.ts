import { AI_ERROR_KEYS, aiErrorCodeFromStatus, aiErrorFromHttp, aiLanguageName, formatAiError, type AiErrorCode } from './aiConfig';

// Traducteur factice : renvoie la clé, avec un gabarit {status} pour la clé qui en a un.
const tr = (k: string) => ((k as string) === 'aiErrorUnknownStatus' ? 'unknown {status}' : `[${k as string}]`);

describe('aiErrorCodeFromStatus', () => {
  it.each<[number, AiErrorCode]>([
    [401, 'invalid_key'],
    [403, 'invalid_key'],
    [402, 'quota'],
    [429, 'quota'],
    [400, 'model_or_url'],
    [404, 'model_or_url'],
    [500, 'provider_down'],
    [503, 'provider_down'],
    [418, 'unknown_status'],
  ])('HTTP %i → %s', (status, code) => {
    expect(aiErrorCodeFromStatus(status)).toBe(code);
  });
});

describe('formatAiError', () => {
  it('traduit par la clé du code, sans texte en dur', () => {
    expect(formatAiError(tr, { code: 'invalid_key' })).toBe('[aiErrorInvalidKey]');
    expect(formatAiError(tr, { code: 'no_key' })).toBe('[copilotNotEnabled]');
  });
  it('ajoute le détail du fournisseur entre parenthèses', () => {
    expect(formatAiError(tr, aiErrorFromHttp(503, 'high demand'))).toBe('[aiErrorProviderDown] (high demand)');
  });
  it('insère le statut HTTP pour un code inconnu', () => {
    expect(formatAiError(tr, aiErrorFromHttp(418))).toBe('unknown 418');
  });
  it('chaque code a une clé i18n non vide', () => {
    for (const key of Object.values(AI_ERROR_KEYS)) expect(key).toMatch(/^[a-zA-Z]+$/);
  });
});

describe('aiLanguageName', () => {
  it('donne un nom de langue, jamais le code seul', () => {
    expect(aiLanguageName('ja')).toContain('Japanese');
    expect(aiLanguageName('en')).toBe('English');
    expect(aiLanguageName('fr')).toContain('French');
  });
  it("retombe sur l'anglais pour une langue inconnue ou absente", () => {
    expect(aiLanguageName('sv')).toBe('English');
    expect(aiLanguageName(undefined)).toBe('English');
  });
});
