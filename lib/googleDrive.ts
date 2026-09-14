/**
 * Google Drive comme coffre PASSIF — session éphémère, jeton jamais persisté.
 *
 * Cycle de vie strict (cf. spec « zéro-connaissance ») :
 *  1. `withDriveToken(fn)` ouvre le navigateur système (PKCE, portée drive.appdata
 *     uniquement), attend la redirection vers le schéma privé, échange le code
 *     contre un jeton d'accès (~1 h) gardé dans une variable locale.
 *  2. `fn(token)` fait SES requêtes (trouver / télécharger / envoyer).
 *  3. Quoi qu'il arrive (succès, erreur, annulation), le jeton est RÉVOQUÉ chez
 *     Google puis effacé. Pas de refresh_token demandé, rien dans AsyncStorage
 *     ni dans le Keychain : l'app n'a plus aucun moyen de recontacter Drive.
 *
 * Prérequis : EXPO_PUBLIC_GOOGLE_CLIENT_ID (client OAuth de type Android/iOS,
 * cf. .env.example) et le schéma inversé déclaré dans app.config.ts (rebuild).
 */
import * as Linking from 'expo-linking';
import {
  buildAuthUrl,
  createPkceSession,
  GOOGLE_REVOKE_URL,
  GOOGLE_TOKEN_URL,
  parseRedirect,
  tokenRequestBody,
} from '../src/domain/backup/oauthPkce';

export const GOOGLE_CLIENT_ID = (process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID ?? '').trim();

/** Vrai si l'app a été configurée (et donc construite) avec un client Google. */
export function isDriveConfigured(): boolean {
  return GOOGLE_CLIENT_ID.endsWith('.apps.googleusercontent.com');
}

export class GoogleAuthError extends Error {
  constructor(
    message: string,
    readonly code: 'not_configured' | 'cancelled' | 'timeout' | 'denied' | 'exchange_failed',
  ) {
    super(message);
    this.name = 'GoogleAuthError';
  }
}

const AUTH_TIMEOUT_MS = 3 * 60_000;

/** Attend la redirection OAuth (ou l'annulation : retour dans l'app sans code). */
function waitForRedirect(clientId: string, state: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      sub.remove();
      reject(new GoogleAuthError('Connexion Google trop longue.', 'timeout'));
    }, AUTH_TIMEOUT_MS);
    const sub = Linking.addEventListener('url', ({ url }) => {
      const r = parseRedirect(url, { clientId, state });
      if (!r) return; // autre deep link (WalletConnect…) : on laisse passer
      clearTimeout(timer);
      sub.remove();
      if ('code' in r) resolve(r.code);
      else if (r.error === 'access_denied') reject(new GoogleAuthError('Accès refusé.', 'denied'));
      else reject(new GoogleAuthError(`Connexion Google refusée (${r.error}).`, 'denied'));
    });
  });
}

async function exchangeCode(clientId: string, code: string, verifier: string): Promise<string> {
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: tokenRequestBody(clientId, code, verifier),
  });
  const data = (await res.json().catch(() => ({}))) as { access_token?: string; error?: string };
  if (!res.ok || !data.access_token) {
    throw new GoogleAuthError(`Échange du code impossible (${data.error ?? res.status}).`, 'exchange_failed');
  }
  return data.access_token;
}

/** Révocation côté Google : le jeton ne vaut plus rien, même s'il fuitait. Jamais bloquant. */
async function revoke(token: string): Promise<void> {
  try {
    await fetch(`${GOOGLE_REVOKE_URL}?token=${encodeURIComponent(token)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });
  } catch {
    /* hors ligne : le jeton expire seul en ~1 h ; il n'a été conservé nulle part */
  }
}

/**
 * Exécute `fn` avec un jeton Drive éphémère, puis le révoque et l'oublie.
 * L'unique point d'entrée vers Google dans toute l'app.
 */
export async function withDriveToken<T>(fn: (token: string) => Promise<T>): Promise<T> {
  if (!isDriveConfigured()) {
    throw new GoogleAuthError('Sauvegarde Google non configurée dans cette version.', 'not_configured');
  }
  const session = createPkceSession();
  const pending = waitForRedirect(GOOGLE_CLIENT_ID, session.state);
  await Linking.openURL(buildAuthUrl(GOOGLE_CLIENT_ID, session));
  const code = await pending;

  let token: string | null = await exchangeCode(GOOGLE_CLIENT_ID, code, session.verifier);
  try {
    return await fn(token);
  } finally {
    const t = token;
    token = null; // plus aucune référence en mémoire côté app
    await revoke(t);
  }
}
