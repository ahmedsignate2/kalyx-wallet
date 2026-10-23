/**
 * PASSKEY (second facteur), côté page : les cérémonies WebAuthn ne peuvent
 * pas avoir lieu dans le service worker. La page obtient la sortie PRF de
 * l'authentificateur (Touch ID, Windows Hello, clé de sécurité) et la passe
 * au service worker avec le mot de passe ; elle ne la garde pas.
 *
 * Aucune vérification de signature ici : il n'y a pas de serveur. Ce qui
 * compte est la sortie PRF, secret de l'authentificateur, liée à cette
 * passkey et au sel du coffre (lib/vault).
 */
import { base64urlnopad } from '@scure/base';
import { bytesToHex } from '@noble/hashes/utils';
import { send } from './dom';

export class PasskeyError extends Error {}

const random = (n: number) => crypto.getRandomValues(new Uint8Array(n));

export const passkeySupported = () => typeof PublicKeyCredential !== 'undefined' && !!navigator.credentials?.create;

/** Annulation par l'utilisateur, délai dépassé, PRF absent : un code chacun. */
function failure(e: unknown): PasskeyError {
  const name = (e as { name?: string })?.name;
  if (e instanceof PasskeyError) return e;
  if (name === 'NotAllowedError' || name === 'AbortError') return new PasskeyError('PASSKEY_CANCELLED');
  if (name === 'InvalidStateError') return new PasskeyError('PASSKEY_EXISTS');
  return new PasskeyError('PASSKEY_FAILED');
}

const prfOf = (c: Credential | null): string | null => {
  const r = (c as PublicKeyCredential | null)?.getClientExtensionResults() as { prf?: { results?: { first?: ArrayBuffer } } } | undefined;
  const first = r?.prf?.results?.first;
  return first && first.byteLength === 32 ? bytesToHex(new Uint8Array(first)) : null;
};

/** Sortie PRF d'une passkey existante, pour ce sel (hex 64). */
export async function passkeyPrf(cred: string, salt: string): Promise<string> {
  try {
    const c = await navigator.credentials.get({
      publicKey: {
        challenge: random(32),
        allowCredentials: [{ type: 'public-key', id: base64urlnopad.decode(cred) as Uint8Array<ArrayBuffer> }],
        userVerification: 'required',
        timeout: 120_000,
        extensions: { prf: { eval: { first: hexBytes(salt) } } } as AuthenticationExtensionsClientInputs,
      },
    });
    const prf = prfOf(c);
    if (!prf) throw new PasskeyError('PASSKEY_NO_PRF');
    return prf;
  } catch (e) {
    throw failure(e);
  }
}

/** Nouvelle passkey avec PRF : identifiant, sel tiré ici, et sortie PRF (demandée une seconde fois si l'authentificateur ne la rend pas à la création). */
export async function createPasskey(): Promise<{ cred: string; salt: string; prf: string }> {
  const salt = bytesToHex(random(32));
  let c: Credential | null;
  try {
    c = await navigator.credentials.create({
      publicKey: {
        rp: { name: 'Kalyx Wallet' },
        user: { id: random(16), name: 'Kalyx Wallet', displayName: 'Kalyx Wallet' },
        challenge: random(32),
        pubKeyCredParams: [
          { type: 'public-key', alg: -7 },
          { type: 'public-key', alg: -257 },
        ],
        authenticatorSelection: { residentKey: 'preferred', userVerification: 'required' },
        timeout: 120_000,
        extensions: { prf: { eval: { first: hexBytes(salt) } } } as AuthenticationExtensionsClientInputs,
      },
    });
  } catch (e) {
    throw failure(e);
  }
  const ext = (c as PublicKeyCredential).getClientExtensionResults() as { prf?: { enabled?: boolean } };
  if (ext.prf?.enabled === false) throw new PasskeyError('PASSKEY_NO_PRF');
  const cred = base64urlnopad.encode(new Uint8Array((c as PublicKeyCredential).rawId));
  return { cred, salt, prf: prfOf(c) ?? (await passkeyPrf(cred, salt)) };
}

function hexBytes(h: string): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(h.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = Number.parseInt(h.slice(i * 2, i * 2 + 2), 16);
  return out;
}

export interface PasskeyStatus {
  passkey: { cred: string; salt: string } | null;
}

/** Déverrouille : mot de passe, puis passkey si le coffre en a une. */
export async function unlockWith(password: string, st: PasskeyStatus): Promise<{ ok: boolean; error?: string; waitMs?: number }> {
  let prf: string | undefined;
  if (st.passkey) {
    try {
      prf = await passkeyPrf(st.passkey.cred, st.passkey.salt);
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  }
  return send({ type: 'vault:unlock', password, ...(prf ? { prf } : {}) });
}

/** Le popup d'action se ferme dès que le focus le quitte : les cérémonies passkey se font dans un onglet. */
export const inPopup = () => location.pathname.endsWith('/popup.html');
