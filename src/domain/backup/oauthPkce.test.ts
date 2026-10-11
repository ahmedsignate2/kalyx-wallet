import { sha256 } from '@noble/hashes/sha256';
import {
  base64url,
  buildAuthUrl,
  createPkceSession,
  parseRedirect,
  redirectUriFor,
  reversedClientScheme,
  tokenRequestBody,
  refreshRequestBody,
  parseTokenResponse,
  isRefreshRejected,
  DRIVE_APPDATA_SCOPE,
} from './oauthPkce';

const CLIENT = '1234567890-abcdefg.apps.googleusercontent.com';

describe('oauthPkce', () => {
  it('inverse l’ID client en schéma privé', () => {
    expect(reversedClientScheme(CLIENT)).toBe('com.googleusercontent.apps.1234567890-abcdefg');
    expect(redirectUriFor(CLIENT)).toBe('com.googleusercontent.apps.1234567890-abcdefg:/oauth2redirect');
    expect(() => reversedClientScheme('nope')).toThrow();
  });

  it('base64url sans padding ni caractères réservés', () => {
    expect(base64url(new Uint8Array([251, 255, 191]))).toBe('-_-_');
    expect(base64url(new Uint8Array([1]))).toBe('AQ');
  });

  it('génère un vérificateur et son défi S256', () => {
    const s = createPkceSession();
    expect(s.verifier).toHaveLength(86);
    expect(s.challenge).toBe(base64url(sha256(new TextEncoder().encode(s.verifier))));
    expect(s.state.length).toBeGreaterThan(10);
    expect(createPkceSession().verifier).not.toBe(s.verifier);
  });

  it('construit l’URL d’autorisation sans refresh_token', () => {
    const s = createPkceSession();
    const url = new URL(buildAuthUrl(CLIENT, s));
    expect(url.origin + url.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    expect(url.searchParams.get('scope')).toBe(DRIVE_APPDATA_SCOPE);
    expect(url.searchParams.get('code_challenge')).toBe(s.challenge);
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('access_type')).toBeNull();
    expect(url.searchParams.get('redirect_uri')).toBe(redirectUriFor(CLIENT));
  });

  it('lit la redirection et refuse un état inattendu', () => {
    const base = redirectUriFor(CLIENT);
    expect(parseRedirect(`${base}?code=abc&state=s1`, { clientId: CLIENT, state: 's1' })).toEqual({ code: 'abc' });
    expect(parseRedirect(`${base}?code=abc&state=other`, { clientId: CLIENT, state: 's1' })).toEqual({ error: 'state_mismatch' });
    expect(parseRedirect(`${base}?error=access_denied&state=s1`, { clientId: CLIENT, state: 's1' })).toEqual({ error: 'access_denied' });
    expect(parseRedirect('kalyx://browse?url=https://x', { clientId: CLIENT, state: 's1' })).toBeNull();
  });

  it('contrôle l’état AVANT l’erreur : un lien forgé ne peut pas annuler le flux', () => {
    const base = redirectUriFor(CLIENT);
    expect(parseRedirect(`${base}?error=access_denied&state=forge`, { clientId: CLIENT, state: 's1' })).toEqual({ error: 'state_mismatch' });
    expect(parseRedirect(`${base}?error=access_denied`, { clientId: CLIENT, state: 's1' })).toEqual({ error: 'state_mismatch' });
    expect(parseRedirect(`${base}?state=s1`, { clientId: CLIENT, state: 's1' })).toEqual({ error: 'missing_code' });
  });

  it('échange le code sans secret client', () => {
    const body = new URLSearchParams(tokenRequestBody(CLIENT, 'c0de', 'verif'));
    expect(body.get('grant_type')).toBe('authorization_code');
    expect(body.get('code_verifier')).toBe('verif');
    expect(body.get('client_secret')).toBeNull();
  });

  it('accès hors ligne seulement sur demande, portée inchangée', () => {
    const s = createPkceSession();
    const plain = new URL(buildAuthUrl(CLIENT, s)).searchParams;
    expect(plain.get('access_type')).toBeNull();
    expect(plain.get('prompt')).toBe('select_account');
    const off = new URL(buildAuthUrl(CLIENT, s, { offline: true })).searchParams;
    expect(off.get('access_type')).toBe('offline');
    expect(off.get('prompt')).toBe('consent');
    expect(off.get('scope')).toBe(DRIVE_APPDATA_SCOPE);
  });

  it('rafraîchit sans secret client', () => {
    const body = new URLSearchParams(refreshRequestBody(CLIENT, 'r3fr'));
    expect(body.get('grant_type')).toBe('refresh_token');
    expect(body.get('refresh_token')).toBe('r3fr');
    expect(body.get('client_id')).toBe(CLIENT);
    expect(body.get('client_secret')).toBeNull();
  });

  it('lit la réponse de jeton sans rien supposer du refresh_token', () => {
    expect(parseTokenResponse({ access_token: 'a', refresh_token: 'r' })).toEqual({ accessToken: 'a', refreshToken: 'r' });
    expect(parseTokenResponse({ access_token: 'a' })).toEqual({ accessToken: 'a' });
    expect(parseTokenResponse({ access_token: 'a', refresh_token: '' })).toEqual({ accessToken: 'a' });
    expect(parseTokenResponse({ error: 'x' })).toBeNull();
    expect(parseTokenResponse(null)).toBeNull();
  });

  it('distingue un refus définitif du refresh_token', () => {
    expect(isRefreshRejected(400, 'invalid_grant')).toBe(true);
    expect(isRefreshRejected(401, undefined)).toBe(true);
    expect(isRefreshRejected(400, 'invalid_request')).toBe(false);
    expect(isRefreshRejected(503, undefined)).toBe(false);
  });
});
