/**
 * CLÉS LOCALES DE LA SAUVEGARDE AUTOMATIQUE (format v3) et crochets du coffre.
 *
 * Le moteur de synchro (lib/backupSync.ts) ne voit JAMAIS un secret : il demande
 * un fichier au fournisseur enregistré ici, et l'envoie. Pour qu'une synchro en
 * arrière-plan puisse reconstruire ce fichier sans PIN ni mot de passe, chaque
 * secret est SCELLÉ une fois pour toutes, au moment où il est en main (création,
 * import, activation), sous la BDK ; le fichier n'est ensuite qu'un assemblage
 * d'enregistrements scellés + un manifeste chiffré sous MK.
 *
 * Ce qui est rangé, tout dans le trousseau, appareil seul (jamais dans une
 * sauvegarde iCloud/Google de l'OS) :
 *  - la BDK, CHIFFRÉE PAR LE PIN comme un coffre (lib/secureStore.ts,
 *    `BACKUP_KEY_VAULT_ID`) : elle ouvre les secrets, elle a donc la protection
 *    des secrets. Elle suit le journal du changement de PIN ;
 *  - MK, en clair dans le trousseau : elle ne protège que le manifeste (noms,
 *    comptes) et l'authenticité de l'en-tête — rien qui ouvre des fonds. C'est
 *    ce qui permet la synchro sans PIN ;
 *  - les clés emballées sous le mot de passe (`WrappedKeys`), déjà chiffrées ;
 *  - l'identifiant de sauvegarde, écrit EN DERNIER : sa présence vaut « prêt » ;
 *  - un enregistrement scellé par portefeuille à secret.
 *
 * Rien de tout cela n'existe en session leurre : le trousseau y est de toute
 * façon fermé (lib/kv.ts), et chaque point d'entrée le vérifie en plus.
 */
import { create } from 'zustand';
import { gcm } from '@noble/ciphers/aes';
import { bytesToHex, bytesToUtf8, hexToBytes, utf8ToBytes } from '@noble/hashes/utils';
import {
  buildV3File,
  canonicalJson,
  generateBackupKeys,
  newBackupId,
  normalizeBackupSecret,
  sealSecret,
  wrapBackupKeys,
  type SealedSecret,
  type V3Record,
  type WrappedKeys,
} from '../src/domain/backup/cloudBackup';
import { decryptSecret, encryptSecret } from '../src/security/vault';
import { KV_DEVICE_ONLY, kvDel, kvGet, kvSet } from './kv';
import { BACKUP_KEY_VAULT_ID, hasVault, loadAccounts, loadVault, saveVault, wipeBackupKeyVault, type WalletMeta } from './secureStore';
import { isDecoySession } from './sessionMode';
import { recordTechnicalLog } from './technicalLogger';
import { backupDigest } from './backupDigest';

const K_ID = 'kalyx.backupKeys.id';
const K_MK = 'kalyx.backupKeys.mk';
const K_WRAPPED = 'kalyx.backupKeys.wrapped';
/** Liste des portefeuilles scellés : le trousseau ne sait pas énumérer, il faut pouvoir tout effacer. */
const K_INDEX = 'kalyx.backupKeys.index';
/** Témoin persistant « réactivation nécessaire » (un secret n'a pas pu être scellé). */
const K_RESEAL = 'kalyx.backupKeys.reseal';
/**
 * Témoin « synchro activée », posé à la PREMIÈRE activation et retiré seulement
 * par la désactivation (ou la réinitialisation). Il survit à une réactivation
 * interrompue : sans lui, des clés absentes (identifiant effacé, app tuée avant
 * la fin) se lisaient « synchro inactive » — fournisseur nul pour toujours,
 * écran « synchronisé le… », alors que plus rien n'était envoyé.
 */
const K_ENABLED = 'kalyx.backupKeys.enabled';
const sealedKey = (walletId: string) => `kalyx.backupKeys.sealed.${walletId}`;

/** Erreur typée du fournisseur : le moteur l'affiche, l'interface propose de réactiver. */
export class BackupKeysError extends Error {
  constructor(public readonly code: 'RESEAL_REQUIRED') {
    super(code);
    this.name = 'BackupKeysError';
  }
}

/**
 * État visible : `needsReactivation` = au moins un portefeuille n'est PAS dans
 * la sauvegarde automatique (scellement raté, ou ajouté avant l'activation).
 * Le fournisseur refuse alors d'envoyer : une sauvegarde incomplète annoncée à
 * jour est pire qu'une synchro en erreur. La seule sortie est de réactiver
 * (mot de passe + PIN), ce qui rescelle tout.
 */
export const useBackupKeys = create<{ needsReactivation: boolean }>(() => ({ needsReactivation: false }));

function setNeedsReactivation(on: boolean): void {
  if (useBackupKeys.getState().needsReactivation !== on) useBackupKeys.setState({ needsReactivation: on });
  if (isDecoySession()) return;
  (on ? kvSet(K_RESEAL, '1', KV_DEVICE_ONLY) : kvDel(K_RESEAL, KV_DEVICE_ONLY)).catch(() => {});
}

/** Journal technique SANS secret : seulement le code ou le type de l'erreur. */
function logFailure(what: string, e: unknown): void {
  try {
    const code = (e as { code?: unknown })?.code;
    recordTechnicalLog('WALLET', `Backup keys: ${what} failed`, { error: typeof code === 'string' ? code : e instanceof Error ? e.name : 'unknown' });
  } catch {
    /* le journal ne doit jamais faire échouer l'appelant */
  }
}

/*
 * VERROU. Activation, désactivation, scellement et assemblage du fichier
 * passent ici l'un après l'autre. Entremêlés, un scellement commencé sous
 * l'ancienne BDK écrasait le sceau neuf d'une réactivation, ou le fournisseur
 * assemblait l'en-tête de l'ancienne sauvegarde avec les sceaux de la nouvelle :
 * un fichier illisible, envoyé et vérifié octet par octet, qui remplaçait sur
 * Drive une sauvegarde saine. Aucune de ces opérations n'appelle une autre
 * opération verrouillée : pas d'interblocage.
 */
let keysLock: Promise<unknown> = Promise.resolve();
function withKeysLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = keysLock.catch(() => {}).then(fn);
  keysLock = run.catch(() => {});
  return run;
}

async function isSyncEnabled(): Promise<boolean> {
  if (isDecoySession()) return false;
  try {
    return (await kvGet(K_ENABLED, KV_DEVICE_ONLY)) === '1';
  } catch {
    return false;
  }
}

/** Moteur de synchro, chargé à la demande : il tire Google Drive et le réseau, inutiles (et lourds) ici. */
async function syncEngine(): Promise<typeof import('./backupSync') | null> {
  try {
    return await import('./backupSync');
  } catch {
    return null;
  }
}

async function readIndex(): Promise<string[]> {
  try {
    const raw = await kvGet(K_INDEX, KV_DEVICE_ONLY);
    const list = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(list) ? list.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

async function writeIndex(ids: readonly string[]): Promise<void> {
  await kvSet(K_INDEX, JSON.stringify([...new Set(ids)]), KV_DEVICE_ONLY);
}

/*
 * Un enregistrement scellé porte l'identifiant de la sauvegarde sous laquelle il
 * l'a été : un sceau d'une sauvegarde précédente (même rangé là par erreur) ne
 * peut plus entrer dans le fichier de la suivante, où il serait illisible.
 */
async function writeSealed(walletId: string, backupId: string, secret: SealedSecret): Promise<void> {
  await kvSet(sealedKey(walletId), JSON.stringify({ b: backupId, s: secret }), KV_DEVICE_ONLY);
}

/** Sceau de ce portefeuille POUR CETTE sauvegarde ; `null` s'il manque, est abîmé ou appartient à une autre. */
async function loadSealed(walletId: string, backupId: string): Promise<SealedSecret | null> {
  try {
    const raw = await kvGet(sealedKey(walletId), KV_DEVICE_ONLY);
    if (!raw) return null;
    const rec = JSON.parse(raw) as { b?: unknown; s?: SealedSecret };
    if (rec?.b !== backupId) return null;
    const s = rec.s;
    return isSealedShape(s) ? { n: s.n, ct: s.ct } : null;
  } catch {
    return null;
  }
}

const isHex = (h: unknown): h is string => typeof h === 'string' && h.length % 2 === 0 && /^[0-9a-f]*$/i.test(h);
/** Même forme que celle qu'exige la restauration : nonce GCM de 12 octets, chiffré au moins de la taille de l'étiquette. */
const isSealedShape = (s: unknown): s is SealedSecret =>
  !!s && isHex((s as SealedSecret).n) && (s as SealedSecret).n.length === 24 && isHex((s as SealedSecret).ct) && (s as SealedSecret).ct.length >= 32;

/** Ce qu'il faut pour assembler un fichier sans PIN. `null` = synchro non prête. */
async function loadSyncState(): Promise<{ backupId: string; mk: string; wrapped: WrappedKeys } | null> {
  if (isDecoySession()) return null;
  try {
    const [backupId, mk, wrapped] = await Promise.all([
      kvGet(K_ID, KV_DEVICE_ONLY),
      kvGet(K_MK, KV_DEVICE_ONLY),
      kvGet(K_WRAPPED, KV_DEVICE_ONLY),
    ]);
    if (!backupId || !mk || mk.length !== 64 || !wrapped) return null;
    return { backupId, mk, wrapped: JSON.parse(wrapped) as WrappedKeys };
  } catch {
    return null;
  }
}

/** Clés en place (identifiant, MK, clés emballées ET BDK sous PIN). Toujours faux en session leurre. */
export async function isAutoSyncKeysReady(): Promise<boolean> {
  if (isDecoySession()) return false;
  if (!(await loadSyncState())) return false;
  try {
    return await hasVault(BACKUP_KEY_VAULT_ID);
  } catch {
    return false;
  }
}

/**
 * BDK déchiffrée par le PIN. À l'appelant de l'effacer (`fill(0)`) dès le
 * scellement fait : elle ne doit pas survivre à l'opération.
 */
async function loadBdk(pin: string): Promise<Uint8Array> {
  const vault = await loadVault(BACKUP_KEY_VAULT_ID);
  if (!vault) throw new Error('BDK_MISSING');
  const h = await decryptSecret(vault, pin);
  if (h.length !== 64) throw new Error('BDK_CORRUPTED');
  return hexToBytes(h);
}

/** Type de secret tel que la sauvegarde l'écrit : une phrase TON part comme une phrase (comme l'export manuel). */
const sealType = (t: WalletMeta['type']): 'seed' | 'privateKey' => (t === 'privateKey' ? 'privateKey' : 'seed');

/**
 * ACTIVATION : exporte TOUS les portefeuilles avec le PIN, génère BDK/MK,
 * emballe les deux sous le mot de passe, scelle chaque secret, range tout.
 *
 * Réactiver repart de clés NEUVES (nouvel identifiant de sauvegarde) : c'est le
 * remède à un scellement raté, et le seul moment où l'on a à la fois le PIN et
 * le mot de passe. Les anciens enregistrements sont effacés avant d'écrire.
 */
export function setupAutoSyncKeys(password: string, pin: string): Promise<void> {
  if (isDecoySession()) return Promise.reject(new Error('DECOY_SESSION'));
  // Export DANS le verrou : un portefeuille ajouté pendant l'activation est soit exporté ici, soit scellé après, sous les clés neuves.
  return withKeysLock(() => setupLocked(password, pin));
}

async function setupLocked(password: string, pin: string): Promise<void> {
  // Import tardif : walletStore importe ce module (crochets).
  const { exportWalletsWithIds } = await import('./walletStore');
  const exported = await exportWalletsWithIds({ pin }); // PIN vérifié (et compté) ici
  if (!exported.length) throw new Error('NO_WALLET');
  const keys = generateBackupKeys();
  try {
    const backupId = newBackupId();
    const wrapped = await wrapBackupKeys(keys, password);
    const sealed = exported.map(({ id, wallet }) => ({
      id,
      secret: sealSecret(keys.bdk, backupId, id, normalizeBackupSecret(wallet.type, wallet.secret)),
    }));
    const bdkVault = await encryptSecret(bytesToHex(keys.bdk), pin);

    await kvSet(K_ENABLED, '1', KV_DEVICE_ONLY);
    // Plus « prêt » pendant l'écriture ; le verrou tient déjà le fournisseur à l'écart.
    await kvDel(K_ID, KV_DEVICE_ONLY);
    const old = await readIndex();
    for (const id of old) if (!sealed.some((s) => s.id === id)) await kvDel(sealedKey(id), KV_DEVICE_ONLY).catch(() => {});
    for (const s of sealed) await writeSealed(s.id, backupId, s.secret);
    await writeIndex(sealed.map((s) => s.id));
    await kvSet(K_MK, bytesToHex(keys.mk), KV_DEVICE_ONLY);
    await kvSet(K_WRAPPED, JSON.stringify(wrapped), KV_DEVICE_ONLY);
    await saveVault(BACKUP_KEY_VAULT_ID, bdkVault); // attend un changement de PIN en suspens, comme un coffre
    await kvSet(K_ID, backupId, KV_DEVICE_ONLY); // EN DERNIER : vaut « prêt »
    setNeedsReactivation(false);
  } finally {
    keys.bdk.fill(0);
    keys.mk.fill(0);
  }
}

/** Efface toutes les clés locales et tous les enregistrements scellés. Ne lève pas pour un élément déjà absent. */
export function teardownAutoSyncKeys(): Promise<void> {
  if (isDecoySession()) return Promise.resolve();
  return withKeysLock(teardownLocked);
}

async function teardownLocked(): Promise<void> {
  // Le témoin d'activation d'abord (désactivation voulue), puis l'identifiant : plus rien n'est « prêt ».
  await kvDel(K_ENABLED, KV_DEVICE_ONLY).catch(() => {});
  await kvDel(K_ID, KV_DEVICE_ONLY).catch(() => {});
  for (const id of await readIndex()) await kvDel(sealedKey(id), KV_DEVICE_ONLY).catch(() => {});
  await Promise.all([
    kvDel(K_INDEX, KV_DEVICE_ONLY).catch(() => {}),
    kvDel(K_MK, KV_DEVICE_ONLY).catch(() => {}),
    kvDel(K_WRAPPED, KV_DEVICE_ONLY).catch(() => {}),
    wipeBackupKeyVault().catch(() => {}),
  ]);
  setNeedsReactivation(false);
}

/* ─────────────── Crochets appelés par walletStore ─────────────── */

/** Contenu de la sauvegarde changé (nom, compte…) : le moteur renverra, après son délai. */
export async function noteBackupChange(reason: string): Promise<void> {
  try {
    if (!(await isAutoSyncKeysReady())) {
      if (!(await isSyncEnabled())) return; // synchro inactive : rien à faire
      // Activée mais clés absentes (réactivation interrompue) : le fournisseur lèvera, l'écran dira « Réactiver ».
      setNeedsReactivation(true);
    }
    (await syncEngine())?.markBackupDirty(reason);
  } catch (e) {
    logFailure('mark dirty', e);
  }
}

/**
 * Nouveau secret en main (création, import) : scellé sous la BDK, puis
 * sauvegarde marquée à renvoyer.
 *
 * NE LÈVE JAMAIS : un portefeuille créé doit rester créé, même si la
 * sauvegarde automatique n'a pas pu le prendre. L'échec est journalisé (sans
 * secret) et l'état passe à « réactivation nécessaire » — le fournisseur
 * refusera d'envoyer une sauvegarde qui ne le contient pas.
 */
export async function sealWalletSecret(walletId: string, type: WalletMeta['type'], secret: string, pin: string): Promise<void> {
  if (isDecoySession() || type === 'watch') return;
  const outcome = await withKeysLock(async (): Promise<'inactive' | 'done'> => {
    let backupId: string;
    try {
      const st = await loadSyncState();
      if (!st || !(await hasVault(BACKUP_KEY_VAULT_ID))) {
        if (!(await isSyncEnabled())) return 'inactive'; // synchro inactive : rien à faire
        throw new Error('KEYS_MISSING'); // activée, clés absentes : réactivation nécessaire
      }
      backupId = st.backupId;
    } catch (e) {
      logFailure('seal', e);
      setNeedsReactivation(true);
      return 'done';
    }
    let bdk: Uint8Array | null = null;
    try {
      bdk = await loadBdk(pin);
      const sealed = sealSecret(bdk, backupId, walletId, normalizeBackupSecret(sealType(type), secret));
      // Toujours la même sauvegarde ? Sinon ce sceau serait illisible dans la nouvelle : on n'écrit rien.
      if ((await kvGet(K_ID, KV_DEVICE_ONLY)) !== backupId) throw new Error('BACKUP_ID_CHANGED');
      await writeSealed(walletId, backupId, sealed);
      await writeIndex([...(await readIndex()), walletId]);
    } catch (e) {
      logFailure('seal', e);
      setNeedsReactivation(true);
    } finally {
      bdk?.fill(0);
    }
    return 'done';
  });
  if (outcome === 'done') await noteBackupChange('wallet-added');
}

/** Portefeuille supprimé : son enregistrement scellé part avec lui. */
export async function dropSealedSecret(walletId: string): Promise<void> {
  if (isDecoySession()) return;
  try {
    await kvDel(sealedKey(walletId), KV_DEVICE_ONLY);
    const ids = await readIndex();
    if (ids.includes(walletId)) await writeIndex(ids.filter((id) => id !== walletId));
  } catch (e) {
    logFailure('drop', e);
  }
  await noteBackupChange('wallet-removed');
}

/** Réinitialisation de l'app : clés effacées ET moteur remis à zéro (jeton, état). */
export async function wipeAutoSyncOnReset(): Promise<void> {
  await teardownAutoSyncKeys().catch((e) => logFailure('teardown', e));
  try {
    await (await syncEngine())?.resetAutoSync();
  } catch (e) {
    logFailure('reset sync', e);
  }
}

/* ─────────────── Fournisseur du fichier ─────────────── */

/**
 * Fichier v3 à envoyer, reconstruit SANS PIN : enregistrements déjà scellés +
 * manifeste (noms, comptes) chiffré sous MK. `null` = rien à envoyer (synchro
 * non prête, session leurre, aucun portefeuille à secret).
 *
 * Un portefeuille à secret sans enregistrement scellé fait LEVER
 * `BackupKeysError('RESEAL_REQUIRED')` : on n'envoie pas une sauvegarde qui
 * l'oublierait (elle remplacerait sur Drive une sauvegarde peut-être complète).
 */
export function buildSyncFile(): Promise<{ content: string; count: number; digest: string | null } | null> {
  return withKeysLock(buildLocked);
}

async function buildLocked(): Promise<{ content: string; count: number; digest: string | null } | null> {
  if (isDecoySession()) return null;
  const st = await loadSyncState();
  if (!st) {
    // Activée mais clés absentes : jamais un silencieux « rien à envoyer », l'écran doit proposer de réactiver.
    if (await isSyncEnabled()) {
      setNeedsReactivation(true);
      throw new BackupKeysError('RESEAL_REQUIRED');
    }
    return null;
  }
  const { useWallet } = await import('./walletStore');
  const { wallets, activeWalletId, accounts: activeAccounts } = useWallet.getState();
  const records: V3Record[] = [];
  const accountsById: Record<string, { index: number; label: string }[]> = {};
  let missing = false;
  for (const w of wallets) {
    if (w.type === 'watch') continue; // aucune clé : rien à sauvegarder
    const secret = await loadSealed(w.id, st.backupId);
    if (!secret) {
      missing = true;
      continue;
    }
    // Comptes comme l'export manuel : l'état pour l'actif (le plus frais), le stockage pour les autres.
    const accounts = ((w.id === activeWalletId ? activeAccounts : await loadAccounts(w.id)) ?? []).map((a) => ({ index: a.index, label: a.label ?? '' }));
    accountsById[w.id] = accounts;
    const type = sealType(w.type);
    records.push({
      id: w.id,
      label: w.label ?? '',
      type,
      ...(type === 'privateKey' ? { keyFamily: w.keyFamily ?? 'evm' } : {}),
      ...(accounts.length ? { accounts } : {}),
      secret,
    });
  }
  if (missing) {
    setNeedsReactivation(true);
    throw new BackupKeysError('RESEAL_REQUIRED');
  }
  // Session leurre ouverte pendant les lectures : on ne livre rien.
  if (!records.length || isDecoySession()) return null;
  // La sauvegarde a changé sous nos pieds (ne devrait plus arriver sous le verrou) : on n'envoie pas un mélange.
  if ((await kvGet(K_ID, KV_DEVICE_ONLY)) !== st.backupId) throw new BackupKeysError('RESEAL_REQUIRED');
  const mk = hexToBytes(st.mk);
  let content: string;
  try {
    content = buildV3File({ backupId: st.backupId, mk, wrapped: st.wrapped, records });
    verifyBuiltFile(content, mk, st.backupId, records);
  } finally {
    mk.fill(0);
  }
  setNeedsReactivation(false); // tout portefeuille à secret est scellé : rien à réactiver
  // Empreinte de CE fichier : le moteur l'enregistrera telle quelle quand l'envoi sera vérifié.
  return { content, count: records.length, digest: backupDigest(wallets, accountsById) };
}

/**
 * RELECTURE AVANT ENVOI (défense en profondeur). Sans la BDK — sous PIN, absente
 * ici — on ne peut pas ouvrir les secrets ; on vérifie donc tout le reste :
 * l'en-tête porte le bon identifiant, le manifeste s'ouvre sous MK avec
 * l'en-tête en AAD (comme à la restauration), et il contient exactement les
 * enregistrements attendus — mêmes identifiants, mêmes sceaux, de forme valide.
 * Le sceau lui-même a été vérifié à l'écriture contre l'identifiant de CETTE
 * sauvegarde (`loadSealed`). Un échec lève : rien n'est envoyé.
 */
function verifyBuiltFile(content: string, mk: Uint8Array, backupId: string, expected: readonly V3Record[]): void {
  const fail = () => {
    throw new BackupKeysError('RESEAL_REQUIRED');
  };
  let file: Record<string, unknown> & { manifest?: SealedSecret; backupId?: unknown; count?: unknown };
  try {
    file = JSON.parse(content);
  } catch {
    return fail();
  }
  if (file.backupId !== backupId || file.count !== expected.length || !isSealedShape(file.manifest)) return fail();
  const { manifest, ...header } = file;
  let pt: Uint8Array | null = null;
  let parsed: { records?: V3Record[] };
  try {
    pt = gcm(mk, hexToBytes(manifest!.n), utf8ToBytes(canonicalJson(header))).decrypt(hexToBytes(manifest!.ct));
    parsed = JSON.parse(bytesToUtf8(pt));
  } catch {
    return fail();
  } finally {
    pt?.fill(0);
  }
  const got = parsed.records;
  if (!Array.isArray(got) || got.length !== expected.length) return fail();
  got.forEach((r, i) => {
    const e = expected[i];
    if (r?.id !== e.id || !isSealedShape(r.secret) || r.secret.n !== e.secret.n || r.secret.ct !== e.secret.ct) fail();
  });
}

/*
 * Enregistrement auprès du moteur au chargement du module (walletStore
 * l'importe, donc dès le démarrage). Import tardif : le moteur ne doit pas
 * peser sur le coffre, ni le faire échouer s'il ne se charge pas.
 */
void syncEngine().then((m) => {
  m?.registerSyncFileProvider(buildSyncFile);
  m?.onAutoSyncDisabled(teardownAutoSyncKeys);
});

// Témoin persistant relu au chargement : l'invite à réactiver survit au redémarrage.
void kvGet(K_RESEAL, KV_DEVICE_ONLY)
  .then((v) => {
    if (v === '1' && !isDecoySession()) useBackupKeys.setState({ needsReactivation: true });
  })
  .catch(() => {});
