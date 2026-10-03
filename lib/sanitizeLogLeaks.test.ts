import { sanitizeLog } from './sanitizeLog';
import { sanitizeSecrets } from './secretDetector';

const PHRASE = 'abandon ability able about above absent absorb abstract absurd abuse access accident';

describe('sanitizeLog — plus de secret qui traverse', () => {
  it('jeton Bearer masqué en entier', () => {
    const out = sanitizeLog('Authorization: Bearer sk-abc123secret');
    expect(out).not.toContain('sk-abc123secret');
  });
  it('phrase de passe en plusieurs mots masquée en entier, JSON toujours valide', () => {
    const out = sanitizeLog('{"passphrase":"correct horse battery","backup":"drive","error":"quota"}');
    expect(out).not.toContain('horse');
    expect(JSON.parse(out)).toEqual({ passphrase: '[MASQUÉ]', backup: '[MASQUÉ]', error: 'quota' });
  });
  it('un mot hors liste au milieu de la phrase ne la laisse pas passer', () => {
    const out = sanitizeLog(PHRASE.replace('absent', 'absnt'));
    expect(out).not.toContain('abandon');
    expect(out).not.toContain('accident');
  });
  it('une phrase anglaise ordinaire reste lisible', () => {
    const txt = 'the user tried to swap again but the quote was expired so we asked for a new one';
    expect(sanitizeLog(txt)).toBe(txt);
  });
  it('URL : paramètres et fragment retirés', () => {
    const out = sanitizeLog('page_load_failed https://app.x/cb?code=abc&access_token=eyJsecret#frag');
    expect(out).not.toContain('eyJsecret');
    expect(out).toContain('https://app.x/cb');
  });
});

describe('sanitizeSecrets — historique du Copilote et tickets', () => {
  it('masque la phrase de récupération', () => {
    expect(sanitizeSecrets(`ma phrase: ${PHRASE}`)).not.toContain('abandon');
  });
  it('garde le nom du champ, plus de « $1 »', () => {
    const out = sanitizeSecrets('password: hunter2');
    expect(out).not.toContain('$1');
    expect(out).not.toContain('hunter2');
    expect(out).toContain('password');
  });
});

describe('sanitizeLog — cas relevés en revue', () => {
  it('idempotent : relancé, rien ne s’ajoute', () => {
    const once = sanitizeSecrets('password=hunter2 words: abandon ability able about above absent absorb abstract');
    expect(sanitizeSecrets(once)).toBe(once);
    expect(sanitizeLog(sanitizeLog('{"pin":"1234"}'))).toBe('{"pin":"[MASQUÉ]"}');
  });
  it('clé de 128 hex masquée', () => {
    expect(sanitizeLog(`secret key ${'ab'.repeat(64)}`)).not.toContain('abab');
  });
  it('Basic, plusieurs mots, tableaux, objets, noms composés, JSON échappé', () => {
    expect(sanitizeLog('Authorization: Basic dXNlcjpwYXNz')).not.toContain('dXNlcjpwYXNz');
    expect(sanitizeLog('password: correct horse battery')).not.toContain('horse');
    const arr = sanitizeLog('{"seed":[12,34,56],"ok":1}');
    expect(JSON.parse(arr)).toEqual({ seed: '[MASQUÉ]', ok: 1 });
    expect(sanitizeLog('{"secretKey":"s1","pinCode":"9999"}')).not.toMatch(/s1|9999/);
    expect(sanitizeLog('{\\"password\\":\\"x9x\\"}')).not.toContain('x9x');
  });
  it('URL : identifiants et clé d’API dans le chemin retirés', () => {
    const out = sanitizeLog('rpc https://eth-mainnet.g.alchemy.com/v2/AbCdEfGhIjKlMnOpQrStUv012345 and https://user:hunter2@rpc.example.com/');
    expect(out).not.toContain('AbCdEfGhIjKlMnOpQrStUv012345');
    expect(out).not.toContain('hunter2');
    expect(out).toContain('eth-mainnet.g.alchemy.com');
  });
  it('la phrase masquée n’avale ni le contexte ni la clé JSON', () => {
    const out = sanitizeLog(`{"error":"x","input":"${PHRASE}"}`);
    expect(JSON.parse(out).input).toBe('[PHRASE_RÉCUPÉRATION_MASQUÉE]');
    expect(sanitizeLog(`field value now (length 12, valid false): ${PHRASE}`)).toContain('valid false');
  });
});
