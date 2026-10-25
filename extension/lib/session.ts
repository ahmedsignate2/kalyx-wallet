/**
 * SESSION de l'extension : verrouillée ou déverrouillée.
 *
 * Déverrouillée = la clé du coffre est dans la zone `session` (en mémoire,
 * vidée à la fermeture du navigateur, illisible par les pages web), SCELLÉE
 * par une clé WebCrypto non exportable (lib/keyBox) : en clair seulement le
 * temps d'une opération. Jamais sur le disque, jamais la phrase elle-même.
 * Chrome arrête le service worker après ~30 s d'inactivité : la zone session
 * survit à ces arrêts tant que le navigateur vit (sauf en mode parano).
 *
 * Se verrouille : sur demande, après le délai d'inactivité (alarme), quand
 * l'écran de l'ordinateur se verrouille, à la fermeture du navigateur.
 *
 * Erreurs : codes — NO_VAULT, VAULT_EXISTS, WEAK_PASSWORD, WRONG_PASSWORD,
 * PASSKEY_REQUIRED, WRONG_PASSKEY (comptés comme un mauvais mot de passe),
 * THROTTLED (avec l'attente), LOCKED, CORRUPTED, BAD_SETTING.
 */
import type { Store } from './storage';
import { isSealedKey, makeKeyBox, memoryWrapStore, type KeyBox, type SealedKey } from './keyBox';
import { addPasskey as vaultAddPasskey, changeVaultPassword, checkVaultPassword, calibrateKdf, createDecoyVault, createVault, parseDecoyVault, parseVault, passkeyMatches, passkeysOf, recodeDecoyVault, removePasskey as vaultRemovePasskey, unlockVault, upgradeLegacyPasskey, type ExtVault, type PasskeyKind } from './vault';
import { DECOY_DISK_PREFIX, PROFILE_KEY, profileOf, type Profile } from './profile';
import { afterFailure, DEFAULT_AUTO_LOCK_MIN, NO_THROTTLE, passwordAccepted, validAutoLock, waitMs, type Throttle } from './policy';

export const AUTO_LOCK_ALARM = 'kalyx-autolock';

export type VaultFn<T> = (vault: ExtVault, key: Uint8Array) => Promise<{ vault?: ExtVault; result: T; commit?: () => Promise<void> }>;

export interface Alarms {
  create(name: string, info: { delayInMinutes: number }): void | Promise<void>;
  clear(name: string): unknown;
}

export interface SessionDeps {
  disk: Store;
  session: Store;
  alarms: Alarms;
  now?: () => number;
  /** Réglages scrypt (les tests les allègent ; en production, ceux du coffre). */
  kdf?: { N: number; r: number; p: number };
  /** Boîte à clé (service worker : W dans IndexedDB ; tests : en mémoire). */
  box?: KeyBox;
  /** Efface du disque toutes les clés qui commencent par ce préfixe (données du profil leurre). */
  purge?: (prefix: string) => Promise<void>;
}

export interface SessionStatus {
  hasVault: boolean;
  unlocked: boolean;
  autoLockMin: number;
  /** Mode parano : session perdue à l'arrêt du service worker, à la perte du focus, en veille. */
  paranoid: boolean;
  /** Second facteur : les passkeys à proposer au déverrouillage (identifiant et sel PRF, publics), vide sans passkey. */
  passkeys: { cred: string; salt: string }[];
  /** Le coffre du profil ouvert a une passkey (réglages, confirmation d'une signature). */
  passkeyHere: boolean;
  /** Ses passkeys (session ouverte seulement) : où elles vivent, depuis quand. */
  passkeyList: { cred: string; salt: string; kind: PasskeyKind; at: number }[];
  /** Un code de contrainte est en place (vu depuis le profil ouvert). */
  duress: boolean;
  /** Attente avant le prochain essai de mot de passe (ms), 0 si libre. */
  waitMs: number;
}

export class SessionError extends Error {
  constructor(code: string, readonly waitMs?: number) {
    super(code);
  }
}

const K = { vault: 'vault', decoy: 'decoyVault', throttle: 'throttle', autoLock: 'autoLockMin', key: 'vaultKey', paranoid: 'paranoid' } as const;
/** Dans le profil leurre, un code de contrainte « réglé » s'enregistre ici : il n'ouvre rien (sinon on trahirait le leurre). */
const DECOY_OWN_DURESS = 'decoy.decoyVault';

export function makeSession(deps: SessionDeps) {
  const now = deps.now ?? Date.now;
  const box = deps.box ?? makeKeyBox(memoryWrapStore());
  const paranoid = async () => (await deps.disk.get<boolean>(K.paranoid)) === true;

  /*
   * UNE opération sensible à la fois. Sans file, dix essais envoyés ensemble
   * liraient tous le compteur d'échecs avant sa mise à jour : le freinage
   * serait contourné.
   */
  let queue: Promise<unknown> = Promise.resolve();
  const serial = <T>(fn: () => Promise<T>): Promise<T> => {
    const run = queue.then(fn, fn);
    queue = run.catch(() => {});
    return run;
  };

  /** Coffre du profil ouvert : le vrai, ou le leurre. */
  const vaultKeyName = async () => ((await profileOf(deps.session)) === 'decoy' ? K.decoy : K.vault);
  const readAt = async (name: string): Promise<ExtVault | null> => {
    const raw = await deps.disk.get<unknown>(name);
    return raw === undefined ? null : parseVault(raw);
  };
  const readVault = async (): Promise<ExtVault | null> => readAt(await vaultKeyName());
  const autoLockMin = async () => (await deps.disk.get<number>(K.autoLock)) ?? DEFAULT_AUTO_LOCK_MIN;
  const throttle = async () => (await deps.disk.get<Throttle>(K.throttle)) ?? NO_THROTTLE;

  /** (Re)lance le minuteur d'inactivité. */
  const arm = async () => {
    await deps.alarms.clear(AUTO_LOCK_ALARM);
    await deps.alarms.create(AUTO_LOCK_ALARM, { delayInMinutes: await autoLockMin() });
  };
  const open = async (vaultKey: Uint8Array, profile: Profile = 'main') => {
    try {
      await deps.session.set(PROFILE_KEY, profile);
      await deps.session.set(K.key, await box.seal(vaultKey, !(await paranoid())));
    } finally {
      vaultKey.fill(0);
    }
    await arm();
  };

  async function lock(): Promise<void> {
    await deps.session.remove(K.key);
    await deps.session.remove(PROFILE_KEY);
    await box.clear();
    await deps.alarms.clear(AUTO_LOCK_ALARM);
  }

  /** Bloc scellé ET clé d'emballage disponible ; sinon (parano après un arrêt, ancien format) la session est fermée. */
  async function sealed(): Promise<SealedKey | null> {
    const s = await deps.session.get<unknown>(K.key);
    if (s === undefined) return null;
    if (isSealedKey(s) && (await box.available())) return s;
    await lock();
    return null;
  }

  async function status(): Promise<SessionStatus> {
    // La passkey demandée au déverrouillage est celle du VRAI coffre (l'écran ne sait pas quel code sera tapé).
    const [main, here, t] = await Promise.all([readAt(K.vault).catch(() => null), readVault().catch(() => null), throttle()]);
    const pks = passkeysOf(main).map(({ cred, salt }) => ({ cred, salt }));
    const unlocked = !!(await sealed());
    const decoy = (await profileOf(deps.session)) === 'decoy';
    const duress = unlocked && (await deps.disk.get(decoy ? DECOY_OWN_DURESS : K.decoy)) !== undefined;
    const list = unlocked ? passkeysOf(here) : [];
    return { hasVault: (await deps.disk.get(K.vault)) !== undefined, unlocked, autoLockMin: await autoLockMin(), paranoid: await paranoid(), passkeys: pks, passkeyHere: list.length > 0, passkeyList: list, duress, waitMs: waitMs(t, now()) };
  }

  /**
   * Une vérification de facteurs (mot de passe, passkey) sous le même freinage
   * que le déverrouillage : un échec compte, une réussite remet à zéro.
   */
  async function guarded<T>(fn: () => Promise<T>): Promise<T> {
    const t = await throttle();
    const wait = waitMs(t, now());
    if (wait > 0) throw new SessionError('THROTTLED', wait);
    let out: T;
    try {
      out = await fn();
    } catch (e) {
      const code = (e as Error).message;
      if (code !== 'WRONG_PASSWORD' && code !== 'WRONG_PASSKEY' && code !== 'PASSKEY_REQUIRED') throw new SessionError(code);
      const next = afterFailure(t, now());
      await deps.disk.set(K.throttle, next);
      throw new SessionError(code, waitMs(next, now()));
    }
    await deps.disk.set(K.throttle, NO_THROTTLE);
    return out;
  }

  /** Premier mot de passe : crée le coffre vide et ouvre la session. */
  async function create(password: string): Promise<void> {
    if ((await deps.disk.get(K.vault)) !== undefined) throw new SessionError('VAULT_EXISTS');
    if (!passwordAccepted(password)) throw new SessionError('WEAK_PASSWORD');
    const { vault, vaultKey } = await createVault(password, deps.kdf ?? (await calibrateKdf()));
    await deps.disk.set(K.vault, vault);
    await open(vaultKey);
  }

  /**
   * Mot de passe → vrai profil ; code de contrainte → profil leurre. Quand un
   * leurre existe, les DEUX scrypt tournent à chaque fois : la durée ne dit
   * pas quel code a été tapé.
   */
  async function unlock(password: string, prf?: Uint8Array): Promise<void> {
    const vault = await readAt(K.vault);
    if (!vault) throw new SessionError('NO_VAULT');
    const decoy = await readAt(K.decoy).catch(() => null);
    let profile: Profile = 'main';
    // Freinage vérifié AVANT le scrypt : un essai refusé ne coûte rien.
    const key = await guarded(async () => {
      const [m, d] = await Promise.allSettled([unlockVault(vault, password, prf), decoy ? unlockVault(decoy, password) : Promise.reject(new Error('WRONG_PASSWORD'))]);
      if (m.status === 'fulfilled') {
        if (d.status === 'fulfilled') d.value.fill(0);
        return m.value;
      }
      if (d.status === 'fulfilled') {
        profile = 'decoy';
        return d.value;
      }
      throw m.reason;
    });
    // Ancien format (une passkey) : converti maintenant que mot de passe et PRF sont justes ; sinon tel quel.
    if (profile === 'main' && vault.passkey && prf) await upgradeLegacyPasskey(vault, password, prf).then((v) => deps.disk.set(K.vault, v), () => {});
    await open(key, profile);
  }

  async function changePassword(oldPassword: string, newPassword: string): Promise<void> {
    const vault = await readVault();
    if (!vault) throw new SessionError('NO_VAULT');
    if (!passwordAccepted(newPassword)) throw new SessionError('WEAK_PASSWORD');
    // Profil leurre : c'est le code de contrainte qui change (même geste, même écran).
    const kdf = deps.kdf ?? (await calibrateKdf());
    await deps.disk.set(await vaultKeyName(), await guarded(() => changeVaultPassword(vault, oldPassword, newPassword, kdf)));
  }

  /**
   * Re-saisie du mot de passe pour une action sensible (afficher la phrase),
   * session déjà ouverte ou non. Même freinage que le déverrouillage.
   */
  async function checkPassword(password: string): Promise<void> {
    const vault = await readVault();
    if (!vault) throw new SessionError('NO_VAULT');
    await guarded(() => checkVaultPassword(vault, password));
  }

  /**
   * Une passkey de plus (ordinateur, téléphone, clé de sécurité ; cinq au
   * plus) : mot de passe redemandé et, s'il y en a déjà une, l'une d'elles.
   */
  async function addPasskey(password: string, proof: Uint8Array | undefined, p: { cred: string; salt: string; prf: Uint8Array; kind: PasskeyKind }): Promise<void> {
    const vault = await readVault();
    if (!vault) throw new SessionError('NO_VAULT');
    // Profil leurre : la passkey protège le vrai coffre ; ici, une erreur ordinaire.
    if ((await profileOf(deps.session)) === 'decoy') throw new SessionError('PASSKEY_FAILED');
    const key = await vaultKey();
    try {
      await deps.disk.set(K.vault, await guarded(() => vaultAddPasskey(vault, password, key, proof, p, now())));
    } finally {
      key.fill(0);
    }
  }

  /** Une passkey retirée : mot de passe et une passkey (n'importe laquelle) une dernière fois. */
  async function removePasskey(password: string, proof: Uint8Array, cred: string): Promise<void> {
    const vault = await readVault();
    if (!vault) throw new SessionError('NO_VAULT');
    if (!passkeysOf(vault).length) throw new SessionError('NO_PASSKEY');
    if (!(await sealed())) throw new SessionError('LOCKED');
    await deps.disk.set(await vaultKeyName(), await guarded(() => vaultRemovePasskey(vault, password, proof, cred)));
  }

  /**
   * Confirmation d'une action par la passkey SEULE, session ouverte (au lieu
   * de retaper le mot de passe pour signer). Même freinage qu'un mot de passe.
   */
  async function checkPasskey(prf: Uint8Array): Promise<void> {
    if (!(await sealed())) throw new SessionError('LOCKED');
    const vault = await readVault();
    await guarded(async () => {
      if (!vault || !passkeyMatches(vault, prf)) throw new Error('WRONG_PASSKEY');
    });
  }

  /**
   * Code de contrainte : réglé (ou changé) depuis le vrai profil, mot de passe
   * redemandé. Le coffre leurre garde ses portefeuilles quand le code change.
   * Depuis le profil leurre, le réglage « réussit » mais n'ouvre rien.
   */
  async function setDuress(password: string, code: string): Promise<void> {
    if (!(await sealed())) throw new SessionError('LOCKED');
    if (!passwordAccepted(code)) throw new SessionError('WEAK_PASSWORD');
    const here = await readVault();
    if (!here) throw new SessionError('NO_VAULT');
    await guarded(() => checkVaultPassword(here, password));
    if ((await profileOf(deps.session)) === 'decoy') {
      if (code === password) throw new SessionError('DURESS_SAME');
      await deps.disk.set(DECOY_OWN_DURESS, (await createVault(code, deps.kdf ?? (await calibrateKdf()))).vault);
      return;
    }
    // Le code ne doit pas ouvrir le vrai coffre (sinon il donnerait l'accès réel).
    const same = await unlockVault(here, code).then(
      (k) => (k.fill(0), true),
      (e: Error) => e.message !== 'WRONG_PASSWORD',
    );
    if (same) throw new SessionError('DURESS_SAME');
    const key = await vaultKey();
    try {
      const raw = await deps.disk.get<unknown>(K.decoy);
      const kdf = deps.kdf ?? (await calibrateKdf());
      const next = raw === undefined ? await createDecoyVault(code, key, kdf) : await recodeDecoyVault(parseDecoyVault(raw), code, key, kdf);
      await deps.disk.set(K.decoy, next);
    } finally {
      key.fill(0);
    }
  }

  /** Code de contrainte retiré : le coffre leurre ET toutes les données du profil leurre sont effacés. */
  async function removeDuress(password: string): Promise<void> {
    if (!(await sealed())) throw new SessionError('LOCKED');
    const here = await readVault();
    if (!here) throw new SessionError('NO_VAULT');
    await guarded(() => checkVaultPassword(here, password));
    if ((await profileOf(deps.session)) === 'decoy') return void (await deps.disk.remove(DECOY_OWN_DURESS));
    await deps.disk.remove(K.decoy);
    await deps.purge?.(DECOY_DISK_PREFIX);
  }

  /** Activité de l'utilisateur : le délai d'inactivité repart de zéro. */
  async function touch(): Promise<void> {
    if (await sealed()) await arm();
  }

  /** Mode parano : effet immédiat sur la session ouverte (la clé d'emballage quitte IndexedDB, ou y revient). */
  async function setParanoid(on: unknown): Promise<void> {
    if (typeof on !== 'boolean') throw new SessionError('BAD_SETTING');
    await deps.disk.set(K.paranoid, on);
    if (await sealed()) await box.persist(!on);
  }

  async function setAutoLock(minutes: unknown): Promise<void> {
    if (!validAutoLock(minutes)) throw new SessionError('BAD_SETTING');
    await deps.disk.set(K.autoLock, minutes);
    await touch();
  }

  /**
   * Clé du coffre, pour le service worker uniquement (signer, lire un secret).
   * Copie à effacer par l'appelant après usage. `LOCKED` si la session est fermée.
   */
  async function vaultKey(): Promise<Uint8Array> {
    const s = await sealed();
    const k = s && (await box.open(s));
    if (!k) {
      if (s) await lock();
      throw new SessionError('LOCKED');
    }
    return k;
  }

  /**
   * Lit le coffre et sa clé, applique `fn`, enregistre le coffre qu'elle rend,
   * PUIS exécute `commit` (les métadonnées) : jamais une métadonnée qui
   * renverrait à un secret absent du coffre. Même file que les autres
   * opérations : une écriture de portefeuille ne croise jamais un changement
   * de mot de passe. La clé est effacée après.
   */
  async function withVault<T>(fn: VaultFn<T>): Promise<T> {
    const vault = await readVault();
    if (!vault) throw new SessionError('NO_VAULT');
    const key = await vaultKey();
    try {
      const out = await fn(vault, key);
      if (out.vault) await deps.disk.set(await vaultKeyName(), out.vault);
      await out.commit?.();
      return out.result;
    } finally {
      key.fill(0);
    }
  }

  return {
    status,
    withVault: <T>(fn: VaultFn<T>) => serial(() => withVault(fn)),
    create: (pw: string) => serial(() => create(pw)),
    unlock: (pw: string, prf?: Uint8Array) => serial(() => unlock(pw, prf)),
    addPasskey: (pw: string, proof: Uint8Array | undefined, p: { cred: string; salt: string; prf: Uint8Array; kind: PasskeyKind }) => serial(() => addPasskey(pw, proof, p)),
    removePasskey: (pw: string, proof: Uint8Array, cred: string) => serial(() => removePasskey(pw, proof, cred)),
    checkPasskey: (prf: Uint8Array) => serial(() => checkPasskey(prf)),
    setDuress: (pw: string, code: string) => serial(() => setDuress(pw, code)),
    removeDuress: (pw: string) => serial(() => removeDuress(pw)),
    changePassword: (oldPw: string, newPw: string) => serial(() => changePassword(oldPw, newPw)),
    checkPassword: (pw: string) => serial(() => checkPassword(pw)),
    lock: () => serial(lock),
    touch,
    setAutoLock,
    setParanoid,
    paranoid,
    vaultKey,
    readVault,
  };
}

export type Session = ReturnType<typeof makeSession>;
