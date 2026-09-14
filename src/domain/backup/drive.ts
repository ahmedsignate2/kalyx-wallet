/**
 * Google Drive, dossier `appDataFolder` : un coffre PASSIF pour la sauvegarde
 * chiffrée (cloudBackup.ts). Le fichier `kalyx_backup.enc` est l'enveloppe JSON
 * scrypt + AES-256-GCM : Google ne voit jamais la phrase, et sans le mot de
 * passe choisi par l'utilisateur, le fichier est inutile.
 *
 * Trois opérations, une requête chacune : trouver, télécharger, envoyer.
 * `fetchFn` injectable pour les tests. Aucun jeton n'est conservé ici.
 */
export const BACKUP_FILE_NAME = 'kalyx_backup.enc';
const API = 'https://www.googleapis.com/drive/v3';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3';

export type FetchFn = typeof fetch;

export interface DriveBackupInfo {
  id: string;
  name: string;
  /** ISO 8601, dernière modification côté Drive. */
  modifiedTime: string;
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

function authHeaders(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

async function ensureOk(res: Response, what: string): Promise<Response> {
  if (res.ok) return res;
  if (res.status === 401 || res.status === 403) throw new DriveError(`Accès Google Drive refusé (${what}).`, res.status);
  throw new DriveError(`Google Drive : ${what} a échoué (HTTP ${res.status}).`, res.status);
}

/** Lit la réponse `files.list` ; garde le fichier le plus récent portant le bon nom. */
export function pickLatestBackup(files: DriveBackupInfo[] | undefined): DriveBackupInfo | null {
  const list = (files ?? []).filter((f) => f.name === BACKUP_FILE_NAME);
  if (!list.length) return null;
  return list.reduce((a, b) => (a.modifiedTime >= b.modifiedTime ? a : b));
}

/** La sauvegarde existante, ou null. Une seule requête. */
export async function findBackup(token: string, fetchFn: FetchFn = fetch): Promise<DriveBackupInfo | null> {
  const q = new URLSearchParams({
    spaces: 'appDataFolder',
    q: `name = '${BACKUP_FILE_NAME}' and trashed = false`,
    fields: 'files(id,name,modifiedTime)',
    pageSize: '10',
  });
  const res = await ensureOk(await fetchFn(`${API}/files?${q}`, { headers: authHeaders(token) }), 'recherche');
  const data = (await res.json()) as { files?: DriveBackupInfo[] };
  return pickLatestBackup(data.files);
}

/** Le contenu chiffré (texte JSON de l'enveloppe). Une seule requête. */
export async function downloadBackup(token: string, fileId: string, fetchFn: FetchFn = fetch): Promise<string> {
  const res = await ensureOk(
    await fetchFn(`${API}/files/${encodeURIComponent(fileId)}?alt=media`, { headers: authHeaders(token) }),
    'téléchargement',
  );
  return res.text();
}

/** Corps multipart (métadonnées + contenu) pour la création dans appDataFolder. */
export function buildMultipartBody(content: string, boundary: string): string {
  const meta = JSON.stringify({ name: BACKUP_FILE_NAME, parents: ['appDataFolder'], mimeType: 'application/json' });
  return (
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n` +
    `--${boundary}\r\nContent-Type: application/json\r\n\r\n${content}\r\n--${boundary}--`
  );
}

/**
 * Crée le fichier, ou remplace son contenu s'il existe déjà (`existingId`).
 * Renvoie l'identifiant du fichier.
 */
export async function uploadBackup(
  token: string,
  content: string,
  existingId: string | null,
  fetchFn: FetchFn = fetch,
): Promise<string> {
  if (existingId) {
    const res = await ensureOk(
      await fetchFn(`${UPLOAD}/files/${encodeURIComponent(existingId)}?uploadType=media`, {
        method: 'PATCH',
        headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
        body: content,
      }),
      'mise à jour',
    );
    const data = (await res.json()) as { id?: string };
    return data.id ?? existingId;
  }
  const boundary = `kalyx_${Date.now().toString(36)}`;
  const res = await ensureOk(
    await fetchFn(`${UPLOAD}/files?uploadType=multipart`, {
      method: 'POST',
      headers: { ...authHeaders(token), 'Content-Type': `multipart/related; boundary=${boundary}` },
      body: buildMultipartBody(content, boundary),
    }),
    'envoi',
  );
  const data = (await res.json()) as { id?: string };
  if (!data.id) throw new DriveError('Google Drive n’a pas renvoyé d’identifiant de fichier.');
  return data.id;
}

/** Supprime la sauvegarde (l'utilisateur retire Kalyx de son Drive). */
export async function deleteBackup(token: string, fileId: string, fetchFn: FetchFn = fetch): Promise<void> {
  await ensureOk(
    await fetchFn(`${API}/files/${encodeURIComponent(fileId)}`, { method: 'DELETE', headers: authHeaders(token) }),
    'suppression',
  );
}
