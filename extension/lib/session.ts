/**
 * SESSION de l'extension : verrouillée ou déverrouillée.
 *
 * Déverrouillée = la clé du coffre est dans la zone `session` (en mémoire,
 * vidée à la fermeture du navigateur, illisible par les pages web). Jamais sur
 * le disque, jamais la phrase elle-même. Chrome arrête le service worker après
 * ~30 s d'inactivité : une clé gardée dans une simple variable serait perdue,
 * la zone session, elle, survit à ces redémarrages tant que le navigateur vit.
 *
 * Se verrouille : sur demande, après le délai d'inactivité (alarme), quand
 * l'écran de l'ordinateur se verrouille, à la fermeture du navigateur.
 *
 * Erreurs : codes — NO_VAULT, VAULT_EXISTS, WEAK_PASSWORD, WRONG_PASSWORD,
 * THROTTLED (avec l'attente), LOCKED, CORRUPTED, BAD_SETTING.
 */
import { bytesToHex, hexToBytes } from '@noble/hashes/utils';
import type { Store } from './storage';
import { changeVaultPassword, createVault, parseVault, unlockVault, type ExtVault } from './vault';
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
}

export interface SessionStatus {
  hasVault: boolean;
  unlocked: boolean;
  autoLockMin: number;
  /** Attente avant le prochain essai de mot de passe (ms), 0 si libre. */
  waitMs: number;
}

export class SessionError extends Error {
  constructor(code: string, readonly waitMs?: number) {
    super(code);
  }
}

const K = { vault: 'vault', throttle: 'throttle', autoLock: 'autoLockMin', key: 'vaultKey' } as const;

export function makeSession(deps: SessionDeps) {
  const now = deps.now ?? Date.now;

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

  const readVault = async (): Promise<ExtVault | null> => {
    const raw = await deps.disk.get<unknown>(K.vault);
    return raw === undefined ? null : parseVault(raw);
  };
  const autoLockMin = async () => (await deps.disk.get<number>(K.autoLock)) ?? DEFAULT_AUTO_LOCK_MIN;
  const throttle = async () => (await deps.disk.get<Throttle>(K.throttle)) ?? NO_THROTTLE;

  /** (Re)lance le minuteur d'inactivité. */
  const arm = async () => {
    await deps.alarms.clear(AUTO_LOCK_ALARM);
    await deps.alarms.create(AUTO_LOCK_ALARM, { delayInMinutes: await autoLockMin() });
  };
  const open = async (vaultKey: Uint8Array) => {
    try {
      await deps.session.set(K.key, bytesToHex(vaultKey));
    } finally {
      vaultKey.fill(0);
    }
    await arm();
  };

  async function lock(): Promise<void> {
    await deps.session.remove(K.key);
    await deps.alarms.clear(AUTO_LOCK_ALARM);
  }

  async function status(): Promise<SessionStatus> {
    const [vault, key, t] = await Promise.all([deps.disk.get(K.vault), deps.session.get<string>(K.key), throttle()]);
    return { hasVault: vault !== undefined, unlocked: !!key, autoLockMin: await autoLockMin(), waitMs: waitMs(t, now()) };
  }

  /** Premier mot de passe : crée le coffre vide et ouvre la session. */
  async function create(password: string): Promise<void> {
    if ((await deps.disk.get(K.vault)) !== undefined) throw new SessionError('VAULT_EXISTS');
    if (!passwordAccepted(password)) throw new SessionError('WEAK_PASSWORD');
    const { vault, vaultKey } = await createVault(password, deps.kdf);
    await deps.disk.set(K.vault, vault);
    await open(vaultKey);
  }

  async function unlock(password: string): Promise<void> {
    const vault = await readVault();
    if (!vault) throw new SessionError('NO_VAULT');
    // Freinage vérifié AVANT le scrypt : un essai refusé ne coûte rien.
    const t = await throttle();
    const wait = waitMs(t, now());
    if (wait > 0) throw new SessionError('THROTTLED', wait);
    let vaultKey: Uint8Array;
    try {
      vaultKey = await unlockVault(vault, password);
    } catch (e) {
      if ((e as Error).message !== 'WRONG_PASSWORD') throw new SessionError((e as Error).message);
      const next = afterFailure(t, now());
      await deps.disk.set(K.throttle, next);
      throw new SessionError('WRONG_PASSWORD', waitMs(next, now()));
    }
    await deps.disk.set(K.throttle, NO_THROTTLE);
    await open(vaultKey);
  }

  async function changePassword(oldPassword: string, newPassword: string): Promise<void> {
    const vault = await readVault();
    if (!vault) throw new SessionError('NO_VAULT');
    if (!passwordAccepted(newPassword)) throw new SessionError('WEAK_PASSWORD');
    const t = await throttle();
    const wait = waitMs(t, now());
    if (wait > 0) throw new SessionError('THROTTLED', wait);
    try {
      await deps.disk.set(K.vault, await changeVaultPassword(vault, oldPassword, newPassword, deps.kdf));
    } catch (e) {
      if ((e as Error).message !== 'WRONG_PASSWORD') throw e;
      const next = afterFailure(t, now());
      await deps.disk.set(K.throttle, next);
      throw new SessionError('WRONG_PASSWORD', waitMs(next, now()));
    }
    await deps.disk.set(K.throttle, NO_THROTTLE);
  }

  /** Activité de l'utilisateur : le délai d'inactivité repart de zéro. */
  async function touch(): Promise<void> {
    if (await deps.session.get(K.key)) await arm();
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
    const k = await deps.session.get<string>(K.key);
    if (!k) throw new SessionError('LOCKED');
    return hexToBytes(k);
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
      if (out.vault) await deps.disk.set(K.vault, out.vault);
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
    unlock: (pw: string) => serial(() => unlock(pw)),
    changePassword: (oldPw: string, newPw: string) => serial(() => changePassword(oldPw, newPw)),
    lock: () => serial(lock),
    touch,
    setAutoLock,
    vaultKey,
    readVault,
  };
}

export type Session = ReturnType<typeof makeSession>;
