/**
 * Google Drive, dossier `appDataFolder` : un coffre PASSIF pour la sauvegarde
 * chiffrée (cloudBackup.ts). Le fichier `kalyx_backup.enc` est l'enveloppe JSON
 * scrypt + AES-256-GCM : Google ne voit jamais la phrase, et sans le mot de
 * passe choisi par l'utilisateur, le fichier est inutile.
 *
 * Opérations élémentaires (lister, télécharger, envoyer, supprimer) + un envoi
 * GARDÉ (`saveBackupGuarded`) qui refuse d'écraser en silence une sauvegarde
 * plus riche ou venue d'un autre appareil, et vérifie ce que Drive a reçu.
 * `fetchFn` injectable pour les tests. Aucun jeton n'est conservé ici.
 */
import { md5 } from '@noble/hashes/legacy';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils';

export const BACKUP_FILE_NAME = 'kalyx_backup.enc';
const API = 'https://www.googleapis.com/drive/v3';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3';
const FILE_FIELDS = 'id,name,modifiedTime,appProperties';

export type FetchFn = typeof fetch;

/**
 * Métadonnées EN CLAIR posées sur le fichier Drive (`appProperties`, chaînes
 * seulement). Rien de secret : un nombre de portefeuilles, un compteur, un
 * identifiant aléatoire d'installation. Elles servent à décider, AVANT
 * d'écraser, si le fichier distant est plus complet ou vient d'un autre téléphone.
 */
export interface BackupProps {
  count?: string;
  rev?: string;
  deviceId?: string;
}

export interface DriveBackupInfo {
  id: string;
  name: string;
  /** ISO 8601, dernière modification côté Drive. */
  modifiedTime: string;
  appProperties?: BackupProps;
}

export class DriveError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'DriveError';
  }
}

/** Ce que Drive a reçu : un écart avec le contenu local n'est jamais annoncé comme une réussite. */
export class DriveVerifyError extends DriveError {
  constructor() {
    super('Google Drive : le fichier reçu ne correspond pas au fichier envoyé.');
    this.name = 'DriveVerifyError';
  }
}

/**
 * Erreur PASSAGÈRE (réseau coupé, Drive surchargé) : le blob chiffré est gardé
 * pour réessayer sans tout ressaisir. Toute autre erreur est définitive.
 * `fetch` lève un TypeError quand la requête n'a pas pu partir.
 */
export function isTransientError(e: unknown): boolean {
  if (e instanceof DriveError) return e.status === 429 || (e.status !== undefined && e.status >= 500);
  return e instanceof TypeError;
}

function authHeaders(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

async function ensureOk(res: Response, what: string): Promise<Response> {
  if (res.ok) return res;
  if (res.status === 401 || res.status === 403) throw new DriveError(`Accès Google Drive refusé (${what}).`, res.status);
  throw new DriveError(`Google Drive : ${what} a échoué (HTTP ${res.status}).`, res.status);
}

function intProp(v: string | undefined): number | undefined {
  if (v === undefined || !/^\d{1,9}$/.test(v)) return undefined;
  return Number(v);
}

/** Révision d'un fichier ; -1 pour un fichier d'avant les appProperties. */
export function revOf(f: DriveBackupInfo): number {
  return intProp(f.appProperties?.rev) ?? -1;
}

/**
 * Le fichier qui fait foi parmi ceux portant le bon nom : la plus grande `rev`,
 * puis la date. La date seule ne suffisait pas — deux envois rapprochés (ou une
 * horloge Drive égale) pouvaient faire gagner l'ancien, et un doublon laissé par
 * un envoi interrompu devenait « la » sauvegarde.
 */
export function pickLatestBackup(files: DriveBackupInfo[] | undefined): DriveBackupInfo | null {
  const list = (files ?? []).filter((f) => f.name === BACKUP_FILE_NAME);
  if (!list.length) return null;
  return list.reduce((a, b) => {
    const ra = revOf(a);
    const rb = revOf(b);
    if (ra !== rb) return ra > rb ? a : b;
    return a.modifiedTime >= b.modifiedTime ? a : b;
  });
}

/** Tous les fichiers de sauvegarde (doublons compris). Une seule requête. */
export async function listBackups(token: string, fetchFn: FetchFn = fetch): Promise<DriveBackupInfo[]> {
  const q = new URLSearchParams({
    spaces: 'appDataFolder',
    q: `name = '${BACKUP_FILE_NAME}' and trashed = false`,
    fields: `files(${FILE_FIELDS})`,
    pageSize: '10',
  });
  const res = await ensureOk(await fetchFn(`${API}/files?${q}`, { headers: authHeaders(token) }), 'recherche');
  const data = (await res.json()) as { files?: DriveBackupInfo[] };
  return (data.files ?? []).filter((f) => f.name === BACKUP_FILE_NAME);
}

/** La sauvegarde qui fait foi, ou null. Une seule requête. */
export async function findBackup(token: string, fetchFn: FetchFn = fetch): Promise<DriveBackupInfo | null> {
  return pickLatestBackup(await listBackups(token, fetchFn));
}

/** Le contenu chiffré (texte JSON de l'enveloppe). Une seule requête. */
export async function downloadBackup(token: string, fileId: string, fetchFn: FetchFn = fetch): Promise<string> {
  const res = await ensureOk(
    await fetchFn(`${API}/files/${encodeURIComponent(fileId)}?alt=media`, { headers: authHeaders(token) }),
    'téléchargement',
  );
  return res.text();
}

/** Nombre de portefeuilles annoncé EN CLAIR par l'enveloppe (cloudBackup.ts), ou undefined. */
export function envelopeCount(text: string): number | undefined {
  try {
    const n = (JSON.parse(text) as { count?: unknown }).count;
    return typeof n === 'number' && Number.isInteger(n) && n >= 0 ? n : undefined;
  } catch {
    return undefined;
  }
}

/** Corps multipart (métadonnées + contenu). Sans `meta` : création dans appDataFolder. */
export function buildMultipartBody(content: string, boundary: string, meta?: Record<string, unknown>): string {
  const m = JSON.stringify(meta ?? { name: BACKUP_FILE_NAME, parents: ['appDataFolder'], mimeType: 'application/json' });
  return (
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${m}\r\n` +
    `--${boundary}\r\nContent-Type: application/json\r\n\r\n${content}\r\n--${boundary}--`
  );
}

export interface UploadedFile {
  id: string;
  md5Checksum?: string;
  size?: string;
  modifiedTime?: string;
}

/**
 * Crée le fichier, ou remplace son contenu s'il existe déjà (`existingId`).
 * Renvoie ce que Drive dit avoir stocké (id, empreinte MD5, taille) : c'est
 * cette réponse, et non le simple « 200 », qui prouve l'envoi.
 */
export async function uploadBackup(
  token: string,
  content: string,
  existingId: string | null,
  fetchFn: FetchFn = fetch,
  props?: BackupProps,
): Promise<UploadedFile> {
  const boundary = `kalyx_${Date.now().toString(36)}`;
  const fields = 'fields=id,md5Checksum,size,modifiedTime';
  const headers = { ...authHeaders(token), 'Content-Type': `multipart/related; boundary=${boundary}` };
  if (existingId) {
    const res = await ensureOk(
      await fetchFn(`${UPLOAD}/files/${encodeURIComponent(existingId)}?uploadType=multipart&${fields}`, {
        method: 'PATCH',
        headers,
        body: buildMultipartBody(content, boundary, props ? { appProperties: props } : {}),
      }),
      'mise à jour',
    );
    const data = (await res.json()) as Partial<UploadedFile>;
    return { ...data, id: data.id ?? existingId };
  }
  const meta = { name: BACKUP_FILE_NAME, parents: ['appDataFolder'], mimeType: 'application/json', ...(props ? { appProperties: props } : {}) };
  const res = await ensureOk(
    await fetchFn(`${UPLOAD}/files?uploadType=multipart&${fields}`, { method: 'POST', headers, body: buildMultipartBody(content, boundary, meta) }),
    'envoi',
  );
  const data = (await res.json()) as Partial<UploadedFile>;
  if (!data.id) throw new DriveError('Google Drive n’a pas renvoyé d’identifiant de fichier.');
  return data as UploadedFile;
}

/** Supprime un fichier de sauvegarde (doublon, ou envoi qui n'a pas passé la vérification). */
export async function deleteBackup(token: string, fileId: string, fetchFn: FetchFn = fetch): Promise<void> {
  await ensureOk(
    await fetchFn(`${API}/files/${encodeURIComponent(fileId)}`, { method: 'DELETE', headers: authHeaders(token) }),
    'suppression',
  );
}

/** MD5 hexadécimal des octets UTF-8 envoyés — ce que Drive calcule de son côté. */
export function contentMd5(content: string): string {
  return bytesToHex(md5(utf8ToBytes(content)));
}

/* ------------------------------------------------------------------ */
/* Garde d'écrasement                                                  */
/* ------------------------------------------------------------------ */

/** Ce qu'on sait du fichier distant au moment de décider. */
export interface RemoteBackup {
  id: string;
  modifiedTime: string;
  rev: number;
  /** Absent : fichier d'avant les appProperties, appareil inconnu. */
  deviceId?: string;
  /** Absent : illisible. */
  count?: number;
}

/** Version distante que l'utilisateur a explicitement accepté de remplacer. */
export interface AcceptedRemote {
  id: string;
  modifiedTime: string;
}

/** Dernière version distante écrite OU restaurée par cet appareil. */
export interface KnownRemote {
  id: string;
  rev: number;
}

export interface ConflictInfo {
  remoteCount?: number;
  localCount: number;
  modifiedTime: string;
  sameDevice: boolean;
  /** À rendre tel quel à la confirmation : le remplacement ne vaut que pour CETTE version. */
  accept: AcceptedRemote;
}

/**
 * Peut-on remplacer `remote` par une sauvegarde de `localCount` portefeuilles ?
 *
 * Un téléphone B qui n'a qu'un portefeuille remplaçait sans un mot la
 * sauvegarde à trois portefeuilles du téléphone A — et A découvrait la perte le
 * jour où il en avait besoin. On n'écrase donc d'office que ce qu'on sait
 * moins complet ou issu de cet appareil :
 *  - rien en ligne → oui ;
 *  - l'utilisateur a vu et accepté CETTE version précise (id + date) → oui ;
 *    si elle a changé entre-temps (autre appareil), on redemande ;
 *  - plus de portefeuilles en ligne qu'ici, ou nombre illisible → non ;
 *  - même appareil, ou version déjà écrite/restaurée ici → oui ;
 *  - fichier d'avant les appProperties (appareil inconnu) mais pas plus riche → oui :
 *    le refuser obligerait chaque utilisateur existant à confirmer une fois, sans
 *    rien protéger que le contrôle du nombre ne protège déjà ;
 *  - autre appareil → non.
 */
export function decideOverwrite(input: {
  remote: RemoteBackup | null;
  localCount: number;
  deviceId: string;
  known?: KnownRemote | null;
  accept?: AcceptedRemote | null;
}): { ok: true } | { ok: false; conflict: ConflictInfo } {
  const { remote, localCount, deviceId, known, accept } = input;
  if (!remote) return { ok: true };
  if (accept && accept.id === remote.id && accept.modifiedTime === remote.modifiedTime) return { ok: true };
  const sameDevice = remote.deviceId === deviceId;
  const conflict = {
    ok: false as const,
    conflict: { remoteCount: remote.count, localCount, modifiedTime: remote.modifiedTime, sameDevice, accept: { id: remote.id, modifiedTime: remote.modifiedTime } },
  };
  if (remote.count === undefined || remote.count > localCount) return conflict;
  if (sameDevice) return { ok: true };
  if (known && known.id === remote.id && known.rev === remote.rev) return { ok: true };
  if (remote.deviceId === undefined) return { ok: true };
  return conflict;
}

export type GuardedSaveResult =
  | { kind: 'saved'; id: string; rev: number; modifiedTime: string }
  | { kind: 'conflict'; conflict: ConflictInfo };

/**
 * Envoi GARDÉ et VÉRIFIÉ, dans une seule session de jeton :
 *  1. liste les fichiers, relit les appProperties du plus récent (et, pour un
 *     ancien fichier sans elles, le nombre de portefeuilles de son enveloppe) ;
 *  2. décide (decideOverwrite) — conflit → on s'arrête, rien n'est écrit ;
 *  3. crée un NOUVEAU fichier (rev + 1) plutôt que de réécrire l'ancien : tant
 *     que le nouveau n'est pas vérifié, l'ancienne sauvegarde reste intacte ;
 *  4. compare le MD5 rendu par Drive à celui du contenu local (à défaut de MD5,
 *     relit le fichier et compare à l'octet près) ; écart → le fichier fautif
 *     est supprimé et l'envoi échoue ;
 *  5. supprime alors les autres fichiers `kalyx_backup.enc` (ancienne version,
 *     doublons d'envois interrompus). Un échec ici n'annule pas l'envoi.
 */
export async function saveBackupGuarded(
  token: string,
  opts: { content: string; deviceId: string; known?: KnownRemote | null; accept?: AcceptedRemote | null },
  fetchFn: FetchFn = fetch,
): Promise<GuardedSaveResult> {
  const { content, deviceId } = opts;
  const localCount = envelopeCount(content) ?? 0;
  const files = await listBackups(token, fetchFn);
  const latest = pickLatestBackup(files);
  let remote: RemoteBackup | null = null;
  if (latest) {
    let count = intProp(latest.appProperties?.count);
    if (count === undefined && latest.appProperties?.count === undefined) {
      count = envelopeCount(await downloadBackup(token, latest.id, fetchFn));
    }
    remote = { id: latest.id, modifiedTime: latest.modifiedTime, rev: revOf(latest), deviceId: latest.appProperties?.deviceId, count };
  }
  const decision = decideOverwrite({ remote, localCount, deviceId, known: opts.known, accept: opts.accept });
  if (!decision.ok) return { kind: 'conflict', conflict: decision.conflict };

  const rev = Math.max(0, ...files.map(revOf)) + 1;
  const up = await uploadBackup(token, content, null, fetchFn, { count: String(localCount), rev: String(rev), deviceId });
  const verified = up.md5Checksum
    ? up.md5Checksum.toLowerCase() === contentMd5(content)
    : (await downloadBackup(token, up.id, fetchFn)) === content;
  if (!verified) {
    await deleteBackup(token, up.id, fetchFn).catch(() => {});
    throw new DriveVerifyError();
  }
  for (const f of files) {
    if (f.id === up.id) continue;
    // Un doublon PLUS RICHE que ce qui vient d'être envoyé (autre que la version
    // examinée et acceptée ci-dessus) n'est jamais supprimé sans avoir été montré.
    const c = intProp(f.appProperties?.count);
    if (f.id !== latest?.id && c !== undefined && c > localCount) continue;
    await deleteBackup(token, f.id, fetchFn).catch(() => {});
  }
  return { kind: 'saved', id: up.id, rev, modifiedTime: up.modifiedTime ?? new Date().toISOString() };
}

/* ------------------------------------------------------------------ */
/* Blob en attente                                                     */
/* ------------------------------------------------------------------ */

/**
 * Durée de vie du blob chiffré gardé sur le téléphone entre le chiffrement et
 * l'envoi (aller-retour Google, réessai réseau, confirmation de remplacement).
 * Chiffré, il est inutile sans le mot de passe ; mais une copie qui traîne
 * indéfiniment après un abandon n'a aucune raison d'exister.
 */
export const PENDING_SAVE_TTL_MS = 15 * 60_000;

export interface PendingSave {
  blob: string;
  /** Date du CHIFFREMENT : un réessai ne prolonge pas la vie du blob. */
  createdAt: number;
  /** Version distante que l'utilisateur a accepté de remplacer (confirmation). */
  accept?: AcceptedRemote;
  /** Conflit en attente de réponse — survit à un redémarrage. */
  conflict?: ConflictInfo;
  /** Dernier envoi interrompu par le réseau : on peut réessayer. */
  failed?: 'network';
}

/** Lit l'enregistrement persisté ; null s'il est absent, illisible ou EXPIRÉ (à purger). */
export function readPendingSave(raw: string | null, now: number): PendingSave | null {
  if (!raw) return null;
  try {
    const p = JSON.parse(raw) as PendingSave;
    if (typeof p.blob !== 'string' || typeof p.createdAt !== 'number') return null;
    if (now - p.createdAt > PENDING_SAVE_TTL_MS || now < p.createdAt - 60_000) return null;
    return p;
  } catch {
    return null;
  }
}
