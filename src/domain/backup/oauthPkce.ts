/**
 * OAuth 2.0 « application installée » avec PKCE (RFC 7636) pour Google Drive.
 *
 * Client de type Android/iOS : PAS de client_secret. L'app ouvre le navigateur
 * système sur l'URL d'autorisation, Google renvoie vers un schéma privé
 * (ID client inversé), l'app échange le `code` contre un jeton d'accès de
 * courte durée. On ne demande AUCUN refresh_token (pas d'`access_type=offline`) :
 * le jeton vit en mémoire le temps d'une opération, puis est révoqué (lib/googleDrive.ts).
 *
 * Portée unique : `drive.appdata` — dossier privé de l'app, invisible dans le
 * Drive de l'utilisateur, sans accès à ses fichiers personnels.
 *
 * Helpers PURS (testés) : aucune dépendance React Native.
 */
import { sha256 } from '@noble/hashes/sha256';
import { getRandomBytes } from '../../crypto/random';

export const DRIVE_APPDATA_SCOPE = 'https://www.googleapis.com/auth/drive.appdata';
export const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
export const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
export const GOOGLE_REVOKE_URL = 'https://oauth2.googleapis.com/revoke';

/** Base64url sans padding (RFC 4648 §5). */
export function base64url(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  const b64 = typeof btoa === 'function' ? btoa(bin) : Buffer.from(bin, 'binary').toString('base64');
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Schéma de redirection d'un client Google Android/iOS : l'ID client inversé.
 * `123-abc.apps.googleusercontent.com` → `com.googleusercontent.apps.123-abc`.
 */
export function reversedClientScheme(clientId: string): string {
  const suffix = '.apps.googleusercontent.com';
  if (!clientId.endsWith(suffix)) throw new Error('ID client Google invalide (attendu *.apps.googleusercontent.com)');
  return `com.googleusercontent.apps.${clientId.slice(0, -suffix.length)}`;
}

export function redirectUriFor(clientId: string): string {
  return `${reversedClientScheme(clientId)}:/oauth2redirect`;
}

export interface PkceSession {
  verifier: string;
  challenge: string;
  state: string;
}

/** Vérificateur 64 octets aléatoires (base64url = 86 caractères), défi S256, état anti-CSRF. */
export function createPkceSession(): PkceSession {
  const verifier = base64url(getRandomBytes(64));
  const challenge = base64url(sha256(new TextEncoder().encode(verifier)));
  const state = base64url(getRandomBytes(16));
  return { verifier, challenge, state };
}

export function buildAuthUrl(clientId: string, session: PkceSession): string {
  const p = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUriFor(clientId),
    response_type: 'code',
    scope: DRIVE_APPDATA_SCOPE,
    code_challenge: session.challenge,
    code_challenge_method: 'S256',
    state: session.state,
    // Pas d'access_type=offline : aucun refresh_token, rien à conserver.
    prompt: 'select_account',
  });
  return `${GOOGLE_AUTH_URL}?${p.toString()}`;
}

export type RedirectResult = { code: string } | { error: string };

/**
 * Lit la redirection `com.googleusercontent.apps.…:/oauth2redirect?code=…&state=…`.
 * Renvoie null si l'URL n'est pas une redirection OAuth (autre deep link).
 */
export function parseRedirect(url: string, expected: { clientId: string; state: string }): RedirectResult | null {
  const prefix = redirectUriFor(expected.clientId);
  if (!url.startsWith(prefix)) return null;
  const q = url.slice(url.indexOf('?') + 1);
  const params = new URLSearchParams(url.includes('?') ? q : '');
  const error = params.get('error');
  if (error) return { error };
  if (params.get('state') !== expected.state) return { error: 'state_mismatch' };
  const code = params.get('code');
  if (!code) return { error: 'missing_code' };
  return { code };
}

/** Corps de l'échange code → jeton (sans secret : client public + PKCE). */
export function tokenRequestBody(clientId: string, code: string, verifier: string): string {
  return new URLSearchParams({
    client_id: clientId,
    code,
    code_verifier: verifier,
    grant_type: 'authorization_code',
    redirect_uri: redirectUriFor(clientId),
  }).toString();
}
