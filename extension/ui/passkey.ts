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

export class PasskeyError extends Error {
  /** Nom de l'erreur WebAuthn d'origine (diagnostic, affiché à côté du message). */
  detail?: string;
}

/** Téléphone ou tablette : « cet appareil » est le téléphone, et l'option « mon téléphone » n'a pas de sens. */
export const onMobile = () => (navigator as { userAgentData?: { mobile?: boolean } }).userAgentData?.mobile === true || /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent);

const random = (n: number) => crypto.getRandomValues(new Uint8Array(n));

export const passkeySupported = () => typeof PublicKeyCredential !== 'undefined' && !!navigator.credentials?.create;

/** Annulation par l'utilisateur, délai dépassé, PRF absent : un code chacun. */
function failure(e: unknown): PasskeyError {
  const name = (e as { name?: string })?.name;
  if (e instanceof PasskeyError) return e;
  if (name === 'NotAllowedError' || name === 'AbortError') return new PasskeyError('PASSKEY_CANCELLED');
  if (name === 'InvalidStateError') return new PasskeyError('PASSKEY_EXISTS');
  /*
   * Navigateur qui refuse WebAuthn à une extension (fréquent sur Android :
   * Kiwi, Mises, Yandex…) ou sans ce type d'authentificateur : dit tel quel,
   * plutôt qu'un « réessaie » qui ne marchera jamais.
   */
  if (name === 'NotSupportedError' || name === 'SecurityError' || name === 'TypeError') return Object.assign(new PasskeyError('PASSKEY_NOT_HERE'), { detail: name });
  return Object.assign(new PasskeyError('PASSKEY_FAILED'), { detail: name ?? String(e).slice(0, 60) });
}

const prfOf = (c: Credential | null): string | null => {
  const r = (c as PublicKeyCredential | null)?.getClientExtensionResults() as { prf?: { results?: { first?: ArrayBuffer } } } | undefined;
  const first = r?.prf?.results?.first;
  return first && first.byteLength === 32 ? bytesToHex(new Uint8Array(first)) : null;
};

/** Passkey publique (identifiant et sel PRF) telle que le coffre la connaît. */
export interface PasskeyRef {
  cred: string;
  salt: string;
}

/**
 * Sortie PRF d'une des passkeys du coffre : l'utilisateur choisit laquelle
 * (cet ordinateur, son téléphone, sa clé). Chaque passkey a son sel :
 * `evalByCredential` donne le bon à chacune.
 */
export async function passkeyPrfAny(list: PasskeyRef[]): Promise<{ cred: string; prf: string }> {
  if (!list.length) throw new PasskeyError('NO_PASSKEY');
  try {
    const c = await navigator.credentials.get({
      publicKey: {
        challenge: random(32),
        allowCredentials: list.map((p) => ({ type: 'public-key' as const, id: base64urlnopad.decode(p.cred) as Uint8Array<ArrayBuffer> })),
        userVerification: 'required',
        timeout: 120_000,
        extensions: { prf: { evalByCredential: Object.fromEntries(list.map((p) => [p.cred, { first: hexBytes(p.salt) }])) } } as AuthenticationExtensionsClientInputs,
      },
    });
    const prf = prfOf(c);
    if (!prf) throw new PasskeyError('PASSKEY_NO_PRF');
    return { cred: base64urlnopad.encode(new Uint8Array((c as PublicKeyCredential).rawId)), prf };
  } catch (e) {
    throw failure(e);
  }
}

/** Sortie PRF d'une passkey précise, pour ce sel (hex 64). */
export async function passkeyPrf(cred: string, salt: string): Promise<string> {
  return (await passkeyPrfAny([{ cred, salt }])).prf;
}

export type PasskeyKind = 'device' | 'phone' | 'key';

/**
 * Où créer la passkey. Ordinateur : Touch ID, Windows Hello. Téléphone : par
 * QR code et Bluetooth, la passkey vit sur le téléphone (iPhone, Android) ;
 * il doit être à côté de l'ordinateur à chaque usage. Clé : YubiKey et autres.
 */
const PLACE: Record<PasskeyKind, { attachment: AuthenticatorAttachment; hints: string[] }> = {
  device: { attachment: 'platform', hints: ['client-device'] },
  phone: { attachment: 'cross-platform', hints: ['hybrid'] },
  key: { attachment: 'cross-platform', hints: ['security-key'] },
};

/** Nouvelle passkey avec PRF : identifiant, sel tiré ici, et sortie PRF (demandée une seconde fois si l'authentificateur ne la rend pas à la création). */
export async function createPasskey(kind: PasskeyKind = 'device', exclude: string[] = []): Promise<{ cred: string; salt: string; prf: string; kind: PasskeyKind }> {
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
        // Les passkeys déjà enregistrées ne sont pas recréées sur le même appareil.
        excludeCredentials: exclude.map((id) => ({ type: 'public-key' as const, id: base64urlnopad.decode(id) as Uint8Array<ArrayBuffer> })),
        authenticatorSelection: { authenticatorAttachment: PLACE[kind].attachment, residentKey: 'preferred', userVerification: 'required' },
        hints: PLACE[kind].hints,
        timeout: 120_000,
        extensions: { prf: { eval: { first: hexBytes(salt) } } } as AuthenticationExtensionsClientInputs,
      } as PublicKeyCredentialCreationOptions,
    });
  } catch (e) {
    throw failure(e);
  }
  const ext = (c as PublicKeyCredential).getClientExtensionResults() as { prf?: { enabled?: boolean } };
  if (ext.prf?.enabled === false) throw new PasskeyError('PASSKEY_NO_PRF');
  const cred = base64urlnopad.encode(new Uint8Array((c as PublicKeyCredential).rawId));
  return { cred, salt, prf: prfOf(c) ?? (await passkeyPrf(cred, salt)), kind };
}

function hexBytes(h: string): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(h.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = Number.parseInt(h.slice(i * 2, i * 2 + 2), 16);
  return out;
}

export interface PasskeyStatus {
  passkeys: PasskeyRef[];
}

/** Déverrouille : mot de passe, puis une des passkeys si le coffre en a. */
export async function unlockWith(password: string, st: PasskeyStatus): Promise<{ ok: boolean; error?: string; waitMs?: number }> {
  let prf: string | undefined;
  if (st.passkeys.length) {
    try {
      prf = (await passkeyPrfAny(st.passkeys)).prf;
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  }
  return send({ type: 'vault:unlock', password, ...(prf ? { prf } : {}) });
}

/** Le popup d'action se ferme dès que le focus le quitte : les cérémonies passkey se font dans un onglet. */
export const inPopup = () => location.pathname.endsWith('/popup.html');
