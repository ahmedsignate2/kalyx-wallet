/**
 * OAuth 2.0 « application installée » avec PKCE (RFC 7636) pour Google Drive.
 *
 * Client de type Android/iOS : PAS de client_secret. L'app ouvre le navigateur
 * système sur l'URL d'autorisation, Google renvoie vers un schéma privé
 * (ID client inversé), l'app échange le `code` contre un jeton d'accès de
 * courte durée. Pour les opérations MANUELLES, on ne demande AUCUN refresh_token
 * (pas d'`access_type=offline`) : le jeton vit en mémoire le temps d'une
 * opération, puis est révoqué (lib/googleDrive.ts).
 *
 * SEULE exception : l'activation de la synchronisation automatique
 * (lib/backupSync.ts) demande un accès hors ligne (`access_type=offline` +
 * `prompt=consent`, sans quoi Google ne renvoie pas de refresh_token à un
 * utilisateur ayant déjà consenti). La portée reste `drive.appdata` seule ; le
 * refresh_token ne vit QUE dans le trousseau de l'appareil.
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

/**
 * `offline` : demande un refresh_token (activation de la synchro automatique).
 * `prompt=consent` est alors indispensable : Google ne délivre un refresh_token
 * qu'au moment d'un consentement explicite, pas sur une simple reconnexion.
 */
export function buildAuthUrl(clientId: string, session: PkceSession, opts: { offline?: boolean } = {}): string {
  const p = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUriFor(clientId),
    response_type: 'code',
    scope: DRIVE_APPDATA_SCOPE,
    code_challenge: session.challenge,
    code_challenge_method: 'S256',
    state: session.state,
    // Sans `offline` : pas d'access_type=offline, aucun refresh_token, rien à conserver.
    prompt: 'select_account',
  });
  if (opts.offline) {
    p.set('access_type', 'offline');
    p.set('prompt', 'consent');
  }
  return `${GOOGLE_AUTH_URL}?${p.toString()}`;
}

export type RedirectResult = { code: string } | { error: string };

/**
 * Lit la redirection `com.googleusercontent.apps.…:/oauth2redirect?code=…&state=…`.
 * Renvoie null si l'URL n'est pas une redirection OAuth (autre deep link).
 *
 * `state` est contrôlé AVANT `error` : sinon n'importe quel lien forgé
 * `…:/oauth2redirect?error=x` était cru et annulait le flux en cours. Un état
 * inattendu donne toujours `state_mismatch`, que l'appelant IGNORE sans
 * toucher à la session en attente (le vrai retour de Google peut encore venir).
 */
export function parseRedirect(url: string, expected: { clientId: string; state: string }): RedirectResult | null {
  const prefix = redirectUriFor(expected.clientId);
  if (!url.startsWith(prefix)) return null;
  const q = url.slice(url.indexOf('?') + 1);
  const params = new URLSearchParams(url.includes('?') ? q : '');
  if (params.get('state') !== expected.state) return { error: 'state_mismatch' };
  const error = params.get('error');
  if (error) return { error };
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

/**
 * Corps du rafraîchissement refresh_token → jeton d'accès. Client « installé »
 * (Android/iOS) : PAS de client_secret, seul le client_id l'identifie.
 */
export function refreshRequestBody(clientId: string, refreshToken: string): string {
  return new URLSearchParams({
    client_id: clientId,
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
  }).toString();
}

/** Réponse du point de jeton, réduite à ce qui nous sert. */
export interface TokenResponse {
  accessToken: string;
  /** Présent seulement après un consentement hors ligne (`buildAuthUrl(…, { offline: true })`). */
  refreshToken?: string;
}

/** Lit la réponse JSON du point de jeton ; null si aucun jeton d'accès. */
export function parseTokenResponse(data: unknown): TokenResponse | null {
  if (!data || typeof data !== 'object') return null;
  const d = data as { access_token?: unknown; refresh_token?: unknown };
  if (typeof d.access_token !== 'string' || !d.access_token) return null;
  return {
    accessToken: d.access_token,
    ...(typeof d.refresh_token === 'string' && d.refresh_token ? { refreshToken: d.refresh_token } : {}),
  };
}

/**
 * Le refresh_token est-il définitivement refusé ? (`invalid_grant` : révoqué par
 * l'utilisateur, expiré, mot de passe Google changé ; 401 : client refusé.)
 * Seule issue : se reconnecter — jamais réessayer en boucle.
 */
export function isRefreshRejected(status: number, error: string | undefined): boolean {
  return status === 401 || error === 'invalid_grant' || error === 'unauthorized_client' || error === 'invalid_client';
}
