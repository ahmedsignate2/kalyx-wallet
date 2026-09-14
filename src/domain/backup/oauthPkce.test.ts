import { sha256 } from '@noble/hashes/sha256';
import {
  base64url,
  buildAuthUrl,
  createPkceSession,
  parseRedirect,
  redirectUriFor,
  reversedClientScheme,
  tokenRequestBody,
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

  it('échange le code sans secret client', () => {
    const body = new URLSearchParams(tokenRequestBody(CLIENT, 'c0de', 'verif'));
    expect(body.get('grant_type')).toBe('authorization_code');
    expect(body.get('code_verifier')).toBe('verif');
    expect(body.get('client_secret')).toBeNull();
  });
});
